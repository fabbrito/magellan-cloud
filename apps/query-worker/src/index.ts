// Routes land with the API; until then nothing is served.
export default {
  fetch(): Response {
    return new Response(null, { status: 404 });
  },
};
