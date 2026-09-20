export default {
  fetch(): Response {
    return new Response("not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
