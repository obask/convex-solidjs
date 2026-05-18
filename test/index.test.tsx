import { Errored, For, Loading, createSignal, flush, isPending } from 'solid-js'
import { render } from '@solidjs/web'
import { describe, expect, it, vi } from 'vite-plus/test'
import {
  ConvexProvider,
  createConnectionState,
  createConvexAction,
  createMutation,
  createQuery,
} from '../src'

const mockQuery = 'mock:query' as any
const mockMutation = 'mock:mutation' as any
const mockAction = 'mock:action' as any

type Listener<T> = {
  key: string
  next: (value: T) => void
  error?: (reason: Error) => void
  unsubscribe: ReturnType<typeof vi.fn>
}

function keyFor(args: unknown): string {
  return JSON.stringify(args)
}

function createMockClient<T>() {
  const listeners: Listener<T>[] = []
  const currentValues = new Map<string, T>()

  const client = {
    onUpdate: vi.fn((_: unknown, args: unknown, next: (value: T) => void, error?: (reason: Error) => void) => {
      const listener: Listener<T> = {
        key: keyFor(args),
        next,
        error,
        unsubscribe: vi.fn(() => {
          const index = listeners.indexOf(listener)
          if (index >= 0) listeners.splice(index, 1)
        }),
      }

      listeners.push(listener)

      return Object.assign(listener.unsubscribe, {
        unsubscribe: listener.unsubscribe,
        getCurrentValue: () => currentValues.get(listener.key),
        getQueryLogs: () => undefined,
      })
    }),
    mutation: vi.fn(async (_: unknown, args: unknown) => args),
    action: vi.fn(async (_: unknown, args: unknown) => args),
    connectionStateValue: {
      hasInflightRequests: false,
      isWebSocketConnected: true,
      timeOfOldestInflightRequest: null,
      hasEverConnected: true,
      connectionCount: 1,
      connectionRetries: 0,
      inflightMutations: 0,
      inflightActions: 0,
    } as any,
    connectionStateListeners: [] as Array<(s: any) => void>,
    connectionState: vi.fn(function (this: any) {
      return this.connectionStateValue
    }),
    subscribeToConnectionState: vi.fn(function (this: any, cb: (s: any) => void) {
      this.connectionStateListeners.push(cb)
      return () => {
        const i = this.connectionStateListeners.indexOf(cb)
        if (i >= 0) this.connectionStateListeners.splice(i, 1)
      }
    }),
    emitConnectionState(next: any) {
      this.connectionStateValue = next
      for (const cb of [...this.connectionStateListeners]) cb(next)
    },
    setCurrent(args: unknown, value: T) {
      currentValues.set(keyFor(args), value)
    },
    emit(args: unknown, value: T) {
      const key = keyFor(args)
      currentValues.set(key, value)
      for (const listener of [...listeners]) {
        if (listener.key === key) listener.next(value)
      }
    },
    fail(args: unknown, reason: Error) {
      const key = keyFor(args)
      for (const listener of [...listeners]) {
        if (listener.key === key) listener.error?.(reason)
      }
    },
    listeners,
  }

  return client as any
}

async function settle() {
  await Promise.resolve()
  flush()
  await Promise.resolve()
}

describe('client API', () => {
  it('throws for createQuery without ConvexProvider', () => {
    const root = document.createElement('div')
    const TestComponent = () => {
      createQuery(mockQuery, {})
      return null
    }

    expect(() => render(() => <TestComponent />, root)).toThrow(
      'createQuery must be used within ConvexProvider',
    )
  })

  it('throws for createMutation without ConvexProvider', () => {
    const root = document.createElement('div')
    const TestComponent = () => {
      createMutation(mockMutation)
      return null
    }

    expect(() => render(() => <TestComponent />, root)).toThrow(
      'createMutation must be used within ConvexProvider',
    )
  })

  it('throws for createConvexAction without ConvexProvider', () => {
    const root = document.createElement('div')
    const TestComponent = () => {
      createConvexAction(mockAction)
      return null
    }

    expect(() => render(() => <TestComponent />, root)).toThrow(
      'createConvexAction must be used within ConvexProvider',
    )
  })

  it('renders an already cached query result without entering Loading', () => {
    const root = document.createElement('div')
    const client = createMockClient<string[]>()
    client.setCurrent({ channel: 'general' }, ['cached'])

    render(
      () => (
        <ConvexProvider client={client}>
          <Loading fallback={<p>loading</p>}>
            <p>{createQuery(mockQuery, { channel: 'general' })().join(',')}</p>
          </Loading>
        </ConvexProvider>
      ),
      root,
    )

    expect(root.textContent).toContain('cached')
    expect(root.textContent).not.toContain('loading')
  })

  it('suspends for first load, keeps stale UI during arg changes, and cleans up subscriptions', async () => {
    const root = document.createElement('div')
    const client = createMockClient<string[]>()
    let setArgs!: (value: { channel: string }) => void

    const TestComponent = () => {
      const [args, setLocalArgs] = createSignal({ channel: 'general' })
      setArgs = setLocalArgs
      const messages = createQuery(mockQuery, args)
      const refreshing = () => isPending(messages)

      return (
        <main>
          <p data-pending>{refreshing() ? 'pending' : 'idle'}</p>
          <Errored fallback={error => <p data-error>{(error as Error).message}</p>}>
            <Loading fallback={<p data-loading>loading</p>}>
              <ul>
                <For each={messages()} keyed={false}>
                  {message => <li>{message()}</li>}
                </For>
              </ul>
            </Loading>
          </Errored>
        </main>
      )
    }

    const dispose = render(
      () => (
        <ConvexProvider client={client}>
          <TestComponent />
        </ConvexProvider>
      ),
      root,
    )

    expect(root.querySelector('[data-loading]')?.textContent).toBe('loading')
    expect(root.querySelector('[data-pending]')?.textContent).toBe('idle')
    expect(client.onUpdate).toHaveBeenCalledTimes(1)

    client.emit({ channel: 'general' }, ['hello'])
    await settle()
    expect(root.textContent).toContain('hello')
    expect(root.querySelector('[data-pending]')?.textContent).toBe('idle')

    setArgs({ channel: 'random' })
    flush()
    await Promise.resolve()

    expect(root.textContent).toContain('hello')
    expect(root.querySelector('[data-pending]')?.textContent).toBe('pending')
    expect(client.onUpdate).toHaveBeenCalledTimes(2)
    expect(client.listeners).toHaveLength(1)

    const unsubscribeCalls = client.onUpdate.mock.results
      .map((result: any) => result.value.unsubscribe as ReturnType<typeof vi.fn>)
      .filter(Boolean)
    expect(unsubscribeCalls[0]).toHaveBeenCalledTimes(1)

    client.emit({ channel: 'random' }, ['goodbye'])
    await settle()
    expect(root.textContent).toContain('goodbye')
    expect(root.textContent).not.toContain('hello')
    expect(root.querySelector('[data-pending]')?.textContent).toBe('idle')

    dispose()
    flush()
    await Promise.resolve()
    expect(unsubscribeCalls[1]).toHaveBeenCalledTimes(1)
  })

  it('surfaces query errors through Errored', async () => {
    const root = document.createElement('div')
    const client = createMockClient<string[]>()

    render(
      () => (
        <ConvexProvider client={client}>
          <Errored fallback={error => <p data-error>{(error as Error).message}</p>}>
            <Loading fallback={<p>loading</p>}>
              <p>{createQuery(mockQuery, { channel: 'general' })().join(',')}</p>
            </Loading>
          </Errored>
        </ConvexProvider>
      ),
      root,
    )

    client.fail({ channel: 'general' }, new Error('boom'))
    await settle()
    expect(root.querySelector('[data-error]')?.textContent).toBe('boom')
  })

  it('passes through mutations and actions', async () => {
    const root = document.createElement('div')
    const client = createMockClient<string[]>()
    let mutate!: ReturnType<typeof createMutation>
    let act!: ReturnType<typeof createConvexAction>

    render(
      () => (
        <ConvexProvider client={client}>
          {(() => {
            mutate = createMutation(mockMutation)
            act = createConvexAction(mockAction)
            return null
          })()}
        </ConvexProvider>
      ),
      root,
    )

    await expect(mutate({ text: 'hi' } as never)).resolves.toEqual({ text: 'hi' })
    await expect(act({ prompt: 'hi' } as never)).resolves.toEqual({ prompt: 'hi' })
    expect(client.mutation).toHaveBeenCalledWith(mockMutation, { text: 'hi' })
    expect(client.action).toHaveBeenCalledWith(mockAction, { prompt: 'hi' })
  })

  it('resolves "skip" args synchronously to undefined without subscribing', async () => {
    const root = document.createElement('div')
    const client = createMockClient<string[]>()
    const [skip, setSkip] = createSignal(true)

    render(
      () => (
        <ConvexProvider client={client}>
          <Loading fallback={<p data-loading>loading</p>}>
            {(() => {
              const q = createQuery(mockQuery, () =>
                skip() ? ('skip' as const) : { channel: 'general' },
              )
              return <p data-value>{q() === undefined ? 'undefined' : (q() as string[]).join(',')}</p>
            })()}
          </Loading>
        </ConvexProvider>
      ),
      root,
    )

    expect(root.querySelector('[data-value]')?.textContent).toBe('undefined')
    expect(root.querySelector('[data-loading]')).toBeNull()
    expect(client.onUpdate).not.toHaveBeenCalled()

    setSkip(false)
    flush()
    await Promise.resolve()

    expect(client.onUpdate).toHaveBeenCalledTimes(1)

    client.emit({ channel: 'general' }, ['hello'])
    await settle()
    expect(root.querySelector('[data-value]')?.textContent).toBe('hello')

    setSkip(true)
    flush()
    await settle()
    expect(root.querySelector('[data-value]')?.textContent).toBe('undefined')
  })

  it('forwards optimisticUpdate via .withOptimisticUpdate and tracks pending', async () => {
    const root = document.createElement('div')
    const client = createMockClient<string[]>()
    let mutate!: ReturnType<typeof createMutation>
    let pending!: () => boolean
    const update = vi.fn()

    let release!: (value: unknown) => void
    client.mutation = vi.fn(
      () => new Promise(resolve => { release = resolve }),
    ) as any

    render(
      () => (
        <ConvexProvider client={client}>
          {(() => {
            const base = createMutation(mockMutation)
            mutate = base.withOptimisticUpdate(update as any)
            pending = mutate.pending
            return null
          })()}
        </ConvexProvider>
      ),
      root,
    )

    expect(pending()).toBe(false)

    const inflight = mutate({ text: 'hi' } as never)
    flush()
    expect(pending()).toBe(true)
    expect(client.mutation).toHaveBeenCalledWith(
      mockMutation,
      { text: 'hi' },
      { optimisticUpdate: update },
    )

    release({ text: 'hi' })
    await inflight
    flush()
    expect(pending()).toBe(false)
  })

  it('exposes pending state for createConvexAction', async () => {
    const root = document.createElement('div')
    const client = createMockClient<string[]>()
    let act!: ReturnType<typeof createConvexAction>

    let release!: (value: unknown) => void
    client.action = vi.fn(
      () => new Promise(resolve => { release = resolve }),
    ) as any

    render(
      () => (
        <ConvexProvider client={client}>
          {(() => {
            act = createConvexAction(mockAction)
            return null
          })()}
        </ConvexProvider>
      ),
      root,
    )

    expect(act.pending()).toBe(false)
    const inflight = act({ prompt: 'hi' } as never)
    flush()
    expect(act.pending()).toBe(true)

    release({ prompt: 'hi' })
    await inflight
    flush()
    expect(act.pending()).toBe(false)
  })

  it('createConnectionState seeds synchronously and updates on change', () => {
    const root = document.createElement('div')
    const client = createMockClient<string[]>()
    let state!: ReturnType<typeof createConnectionState>

    render(
      () => (
        <ConvexProvider client={client}>
          {(() => {
            state = createConnectionState()
            return null
          })()}
        </ConvexProvider>
      ),
      root,
    )

    expect(state().isWebSocketConnected).toBe(true)
    expect(state().hasInflightRequests).toBe(false)
    expect(client.subscribeToConnectionState).toHaveBeenCalledTimes(1)

    client.emitConnectionState({
      ...client.connectionStateValue,
      hasInflightRequests: true,
      inflightMutations: 1,
    })
    flush()
    expect(state().hasInflightRequests).toBe(true)
    expect(state().inflightMutations).toBe(1)
  })
})
