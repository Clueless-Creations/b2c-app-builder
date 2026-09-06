export interface BatchMessage {
  content: unknown;
  stop_reason?: unknown;
  usage?: unknown;
}
export interface BatchResult {
  custom_id: string;
  result: { type: string; message?: BatchMessage };
}
export interface BatchApi {
  create(input: {
    requests: Array<{ custom_id: string; params: Record<string, unknown> }>;
    betas?: string[];
  }): Promise<{ id: string; processing_status: string }>;
  retrieve(id: string): Promise<{ id: string; processing_status: string }>;
  results(id: string): Promise<AsyncIterable<BatchResult>>;
}

/** Same-tick requests form one batch. A dependent grading stage forms the next. */
export function batchedMessages(
  api: BatchApi,
  persist: (event: unknown) => void,
  wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  resume: (requests: unknown) => string | undefined = () => undefined,
) {
  let sequence = 0;
  let pending: Array<{ id: string; params: Record<string, unknown>; resolve: (message: BatchMessage) => void; reject: (error: unknown) => void }> = [];
  async function flush(): Promise<void> {
    const requests = pending;
    pending = [];
    try {
      const betas = [...new Set(requests.flatMap((request) => (request.params.betas ?? []) as string[]))];
      const requestIdentity = requests.map(({ id, params }) => ({ custom_id: id, params }));
      const resumedId = resume(requestIdentity);
      let batch = resumedId
        ? await api.retrieve(resumedId)
        : await api.create({
            requests: requests.map(({ id, params }) => {
              const { betas: _betas, ...body } = params;
              return { custom_id: id, params: body };
            }),
            ...(betas.length ? { betas } : {}),
          });
      persist({ stage: "submitted", batch_id: batch.id, requests: requestIdentity });
      while (batch.processing_status !== "ended") {
        await wait(30_000);
        batch = await api.retrieve(batch.id);
        persist({ stage: "poll", batch_id: batch.id, processing_status: batch.processing_status });
      }
      const received = new Map<string, BatchMessage>();
      const expected = new Set(requests.map(({ id }) => id));
      for await (const row of await api.results(batch.id)) {
        if (!expected.has(row.custom_id) || received.has(row.custom_id)) throw new Error(`Unexpected or duplicate batch custom_id: ${row.custom_id}`);
        persist({ stage: "result", batch_id: batch.id, ...row });
        received.set(
          row.custom_id,
          row.result.type === "succeeded" && row.result.message ? row.result.message : { content: [], stop_reason: `batch_${row.result.type}` },
        );
      }
      // Resolve together only after validating the entire result set. Grading
      // therefore submits once, regardless of result arrival order.
      for (const request of requests) request.resolve(received.get(request.id) ?? { content: [], stop_reason: "batch_missing_result" });
    } catch (error) {
      for (const request of requests) request.reject(error);
    }
  }
  return (params: Record<string, unknown>): Promise<BatchMessage> =>
    new Promise((resolve, reject) => {
      pending.push({ id: `request_${++sequence}`, params, resolve, reject });
      if (pending.length === 1)
        queueMicrotask(() => {
          void flush();
        });
    });
}
