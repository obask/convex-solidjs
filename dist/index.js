import { createComponent, isServer } from "@solidjs/web";
import { createContext, createMemo, createSignal, onCleanup, useContext } from "solid-js";
import { ConvexClient, ConvexHttpClient } from "convex/browser";
//#region src/index.tsx
const ConvexClientContext = createContext(null);
function resolveValue(value) {
	return typeof value === "function" ? value() : value;
}
function hasOwnInitialValue(options) {
	return options != null && Object.prototype.hasOwnProperty.call(options, "initialValue");
}
function toError(error) {
	return error instanceof Error ? error : new Error(String(error));
}
function missingProviderError(label) {
	return /* @__PURE__ */ new Error(`${label} must be used within ConvexProvider`);
}
function missingProviderExecutionError(label) {
	return /* @__PURE__ */ new Error(`${label} cannot execute during SSR without ConvexProvider`);
}
function syncThenable(value) {
	return { then(onfulfilled) {
		return syncThenable(onfulfilled ? onfulfilled(value) : value);
	} };
}
function ConvexProvider(props) {
	return createComponent(ConvexClientContext, {
		get value() {
			return props.client;
		},
		get children() {
			return props.children;
		}
	});
}
function useConvexClient() {
	const client = useContext(ConvexClientContext);
	if (!client) throw missingProviderError("useConvexClient");
	return client;
}
function createConvexClient(address, options) {
	return new ConvexClient(address, options);
}
const setupConvex = createConvexClient;
function createConvexHttpClient(address, options) {
	return new ConvexHttpClient(address, options);
}
const setupConvexHttp = createConvexHttpClient;
async function prefetchQuery(client, query, args) {
	return client.query(query, args);
}
function createQuery(query, args, options) {
	const client = useContext(ConvexClientContext);
	if (!client && !isServer) throw missingProviderError("createQuery");
	const hasInitialValue = hasOwnInitialValue(options);
	const initialValue = hasInitialValue ? options.initialValue : void 0;
	const ssrSource = options?.ssrSource ?? (hasInitialValue ? "initial" : void 0);
	let activeDispose;
	const value = createMemo(() => {
		if (!client) throw missingProviderError("createQuery");
		activeDispose?.();
		const queryArgs = resolveValue(args);
		if (queryArgs === "skip") {
			activeDispose = void 0;
			let yielded = false;
			return { [Symbol.asyncIterator]() {
				return { next() {
					if (yielded) return syncThenable({
						value: void 0,
						done: true
					});
					yielded = true;
					return syncThenable({
						value: void 0,
						done: false
					});
				} };
			} };
		}
		const queue = [];
		let nextResolve = null;
		let nextReject = null;
		let pendingError = null;
		let closed = false;
		const unsubscribe = client.onUpdate(query, queryArgs, (result) => {
			if (closed) return;
			if (nextResolve) {
				const resolve = nextResolve;
				nextResolve = null;
				nextReject = null;
				resolve({
					value: result,
					done: false
				});
				return;
			}
			queue.push(result);
		}, (reason) => {
			const error = toError(reason);
			if (closed) return;
			if (nextReject) {
				const reject = nextReject;
				nextResolve = null;
				nextReject = null;
				reject(error);
				return;
			}
			pendingError = error;
		});
		const disposeQuery = () => {
			if (closed) return;
			closed = true;
			unsubscribe.unsubscribe();
			if (nextResolve) {
				nextResolve({
					value: void 0,
					done: true
				});
				nextResolve = null;
				nextReject = null;
			}
			if (activeDispose === disposeQuery) activeDispose = void 0;
		};
		activeDispose = disposeQuery;
		const currentValue = unsubscribe.getCurrentValue();
		if (currentValue !== void 0) queue.push(currentValue);
		onCleanup(disposeQuery);
		return { [Symbol.asyncIterator]() {
			return {
				next() {
					if (pendingError) {
						const error = pendingError;
						pendingError = null;
						return Promise.reject(error);
					}
					if (queue.length > 0) return syncThenable({
						value: queue.shift(),
						done: false
					});
					if (closed) return syncThenable({
						value: void 0,
						done: true
					});
					return new Promise((resolve, reject) => {
						nextResolve = resolve;
						nextReject = reject;
					});
				},
				return() {
					disposeQuery();
					return syncThenable({
						value: void 0,
						done: true
					});
				}
			};
		} };
	}, initialValue, {
		name: "convex-query",
		ssrSource
	});
	onCleanup(() => activeDispose?.());
	return value;
}
function createMutation(mutation) {
	const client = useContext(ConvexClientContext);
	if (!client) {
		if (!isServer) throw missingProviderError("createMutation");
		const stub = (async () => {
			throw missingProviderExecutionError("createMutation");
		});
		stub.withOptimisticUpdate = () => stub;
		stub.pending = () => false;
		return stub;
	}
	return buildMutation(client, mutation, void 0);
}
function buildMutation(client, mutation, optimisticUpdate) {
	const [inflight, setInflight] = createSignal(0);
	const call = ((args) => {
		setInflight((n) => n + 1);
		return (optimisticUpdate ? client.mutation(mutation, args, { optimisticUpdate }) : client.mutation(mutation, args)).finally(() => setInflight((n) => n - 1));
	});
	call.withOptimisticUpdate = (update) => buildMutation(client, mutation, update);
	call.pending = () => inflight() > 0;
	return call;
}
function createConvexAction(actionReference) {
	const client = useContext(ConvexClientContext);
	if (!client) {
		if (!isServer) throw missingProviderError("createConvexAction");
		const stub = (async () => {
			throw missingProviderExecutionError("createConvexAction");
		});
		stub.pending = () => false;
		return stub;
	}
	const [inflight, setInflight] = createSignal(0);
	const call = ((args) => {
		setInflight((n) => n + 1);
		return client.action(actionReference, args).finally(() => setInflight((n) => n - 1));
	});
	call.pending = () => inflight() > 0;
	return call;
}
/**
* Subscribe to the realtime client's {@link ConnectionState}. The accessor
* is seeded synchronously and updated on every state change.
*/
function createConnectionState() {
	const client = useContext(ConvexClientContext);
	if (!client) throw missingProviderError("createConnectionState");
	const [state, setState] = createSignal(client.connectionState());
	onCleanup(client.subscribeToConnectionState((next) => setState(() => next)));
	return state;
}
//#endregion
export { ConvexProvider, createConnectionState, createConvexAction, createConvexClient, createConvexHttpClient, createMutation, createQuery, prefetchQuery, setupConvex, setupConvexHttp, useConvexClient };
