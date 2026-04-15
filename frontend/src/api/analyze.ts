export async function POST(request: Request) {
  const body = await request.json();

  const backendResponse = await fetch(
    "https://anchored-flow-stack.onrender.com/analyze",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-analyze-secret": "dev-secret",
      },
      body: JSON.stringify(body),
    }
  );

  const data = await backendResponse.json();

  return new Response(JSON.stringify(data), {
    status: backendResponse.status,
    headers: { "Content-Type": "application/json" },
  });
}
