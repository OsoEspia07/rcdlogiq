import { errorJson, okJson } from "@/lib/api-response";
import { searchAddressSuggestions } from "@/lib/geo";
import { enforceRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/session";
import { cleanString } from "@/lib/validation";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return errorJson("No autenticado.", 401);

  const limited = await enforceRateLimit({ key: rateLimitKey("geocode", user.id), limit: 30, windowMs: 60_000, type: "geocode", userId: user.id });
  if (limited) return limited;

  const url = new URL(request.url);
  const address = cleanString(url.searchParams.get("q"), 240);
  const city = cleanString(url.searchParams.get("city") ?? "Bogota", 80) || "Bogota";
  if (address.length < 4) return okJson([]);

  const suggestions = await searchAddressSuggestions(address, city);
  return okJson(suggestions);
}
