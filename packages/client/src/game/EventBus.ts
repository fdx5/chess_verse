type Listener<T> = (payload: T) => void;

/** D1 §이벤트 버스 — 레이어 간 통신은 이 버스를 통해서만(렌더러가 룰 엔진을 직접 mutate하지 않음). */
export class EventBus<M> {
  private readonly listeners: Partial<Record<keyof M, Set<Listener<never>>>> = {};

  on<K extends keyof M>(event: K, listener: Listener<M[K]>): () => void {
    let set = this.listeners[event];
    if (set === undefined) {
      set = new Set();
      this.listeners[event] = set;
    }
    set.add(listener as Listener<never>);
    return () => {
      set.delete(listener as Listener<never>);
    };
  }

  emit<K extends keyof M>(event: K, payload: M[K]): void {
    const set = this.listeners[event];
    if (set === undefined) return;
    for (const listener of set) (listener as Listener<M[K]>)(payload);
  }
}
