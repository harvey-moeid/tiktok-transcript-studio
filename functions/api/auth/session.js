import { authorized, json } from "../../_lib.js";
export async function onRequestGet({ request, env }) {
  return (await authorized(request, env)) ? json({ authenticated: true }) : json({ authenticated: false }, 401);
}
