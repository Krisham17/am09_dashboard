import { initState, stepState, kpisFrom } from "../../../lib/mock";

export const runtime = "nodejs";
console.log("BRIDGE_URL =", process.env.BRIDGE_URL);


export async function GET(req: Request) {
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: any) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)
        );
      };

      const timer = setInterval(async () => {
        if (closed) return;
        try {
          const res = await fetch(
            `${process.env.BRIDGE_URL}/state`
          );
          const data = await res.json();
          send(data);
        } catch {
          send({ type: "error", message: "Bridge offline" });
        }
      }, 1000);

      req.signal?.addEventListener("abort", () => {
        closed = true;
        clearInterval(timer);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
