export function GET(request: Request) {
  return Response.redirect(new URL('/static/assets/favicon.png', request.url), 307);
}
