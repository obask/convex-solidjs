import * as _$solid_js0 from "solid-js";
import { Accessor, ParentProps } from "solid-js";
import { ConnectionState, ConvexClient, ConvexClientOptions, ConvexHttpClient, OptimisticLocalStore, OptimisticUpdate, OptimisticUpdate as OptimisticUpdate$1 } from "convex/browser";
import { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";

//#region src/index.d.ts
type MaybeAccessor<T> = T | Accessor<T>;
type QuerySsrSource = 'server' | 'hybrid' | 'initial' | 'client';
interface CreateQueryOptions<T> {
  initialValue?: T;
  ssrSource?: QuerySsrSource;
}
declare function ConvexProvider(props: ParentProps<{
  client: ConvexClient;
}>): _$solid_js0.JSX.Element;
declare function useConvexClient(): ConvexClient;
declare function createConvexClient(address: string, options?: ConvexClientOptions): ConvexClient;
declare const setupConvex: typeof createConvexClient;
declare function createConvexHttpClient(address: string, options?: ConstructorParameters<typeof ConvexHttpClient>[1]): ConvexHttpClient;
declare const setupConvexHttp: typeof createConvexHttpClient;
declare function prefetchQuery<Query extends FunctionReference<'query'>>(client: ConvexHttpClient, query: Query, args: FunctionArgs<Query>): Promise<FunctionReturnType<Query>>;
declare function createQuery<Query extends FunctionReference<'query'>>(query: Query, args: MaybeAccessor<FunctionArgs<Query> | 'skip'>, options?: CreateQueryOptions<FunctionReturnType<Query> | undefined>): Accessor<FunctionReturnType<Query> | undefined>;
type ConvexMutation<Mutation extends FunctionReference<'mutation'>> = {
  (args: FunctionArgs<Mutation>): Promise<FunctionReturnType<Mutation>>;
  /**
   * Bind a Convex optimistic update to this mutation. Returns a new bound
   * mutation; the original is unaffected. The handler runs against the
   * client's local query cache and is rolled back automatically when the
   * server transaction completes (success or failure).
   */
  withOptimisticUpdate(update: OptimisticUpdate$1<FunctionArgs<Mutation>>): ConvexMutation<Mutation>; /** `true` while one or more calls are in flight. */
  pending: Accessor<boolean>;
};
declare function createMutation<Mutation extends FunctionReference<'mutation'>>(mutation: Mutation): ConvexMutation<Mutation>;
type ConvexAction<ActionRef extends FunctionReference<'action'>> = {
  (args: FunctionArgs<ActionRef>): Promise<FunctionReturnType<ActionRef>>; /** `true` while one or more calls are in flight. */
  pending: Accessor<boolean>;
};
declare function createConvexAction<ActionRef extends FunctionReference<'action'>>(actionReference: ActionRef): ConvexAction<ActionRef>;
/**
 * Subscribe to the realtime client's {@link ConnectionState}. The accessor
 * is seeded synchronously and updated on every state change.
 */
declare function createConnectionState(): Accessor<ConnectionState>;
//#endregion
export { ConvexAction, ConvexMutation, ConvexProvider, CreateQueryOptions, MaybeAccessor, type OptimisticLocalStore, type OptimisticUpdate, QuerySsrSource, createConnectionState, createConvexAction, createConvexClient, createConvexHttpClient, createMutation, createQuery, prefetchQuery, setupConvex, setupConvexHttp, useConvexClient };