type Coordinates = {
  latitude: number;
  longitude: number;
};

export type AddressSuggestion = Coordinates & {
  label: string;
  precision?: "exacta" | "aproximada";
};

function fallbackBogotaCoordinates(input: string): Coordinates {
  let hash = 0;
  for (const char of input) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const latOffset = ((hash % 1200) - 600) / 10000;
  const lngOffset = ((((hash / 1200) | 0) % 1400) - 700) / 10000;
  return {
    latitude: Number((4.711 + latOffset).toFixed(7)),
    longitude: Number((-74.0721 + lngOffset).toFixed(7)),
  };
}

export function parseCoordinates(latitude: unknown, longitude: unknown): Coordinates | null {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return {
    latitude: Number(lat.toFixed(7)),
    longitude: Number(lng.toFixed(7)),
  };
}

function extractCoordinatesFromText(input: string): Coordinates | null {
  const match = input.match(/(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/);
  if (!match) return null;
  return parseCoordinates(match[1], match[2]);
}

function normalizeBogotaAddress(input: string) {
  const compact = input
    .trim()
    .replace(/\bav\.?\s*cra\s*(\d+)/gi, "Avenida Carrera $1")
    .replace(/\bav\.?\s*carrera\s*(\d+)/gi, "Avenida Carrera $1")
    .replace(/\bavenida\s*cra\s*(\d+)/gi, "Avenida Carrera $1")
    .replace(/\bavenida\s*carrera\s*(\d+)/gi, "Avenida Carrera $1")
    .replace(/\bav\.?\s*calle\s*(\d+)/gi, "Avenida Calle $1")
    .replace(/\bavenida\s*calle\s*(\d+)/gi, "Avenida Calle $1")
    .replace(/\bav\.?\s*19\b/gi, "Avenida Carrera 19")
    .replace(/\bavenida\s*19\b/gi, "Avenida Carrera 19")
    .replace(/\bcalle\s*(\d+)/gi, "Calle $1")
    .replace(/\bcarrera\s*(\d+)/gi, "Carrera $1")
    .replace(/\btransversal\s*(\d+)/gi, "Transversal $1")
    .replace(/\bdiagonal\s*(\d+)/gi, "Diagonal $1")
    .replace(/\bcll\s*(\d+)/gi, "Calle $1")
    .replace(/\bcl\s*(\d+)/gi, "Calle $1")
    .replace(/\bcra\s*(\d+)/gi, "Carrera $1")
    .replace(/\bkr\s*(\d+)/gi, "Carrera $1")
    .replace(/\bcr\s*(\d+)/gi, "Carrera $1")
    .replace(/\bcll\b\.?/gi, "Calle")
    .replace(/\bcl\b\.?/gi, "Calle")
    .replace(/\bcra\b\.?/gi, "Carrera")
    .replace(/\bkr\b\.?/gi, "Carrera")
    .replace(/\bcr\b\.?/gi, "Carrera")
    .replace(/\bav\b\.?/gi, "Avenida")
    .replace(/\s+/g, " ");

  return compact
    .replace(/\s*#\s*/g, " #")
    .replace(/\s*-\s*/g, "-")
    .replace(/\bn\s*([0-9]+[a-z]?)\s*-\s*([0-9]+[a-z]?)\b/gi, "#$1-$2")
    .replace(/\bn\s*([0-9]+[a-z]?)\b/gi, "#$1")
    .replace(/#\s+/g, "#");
}

type ParsedBogotaAddress = {
  roadType: string;
  principal: string;
  cross: string;
  distance: string;
  canonical: string;
};

function normalizeAddressToken(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .replace(/\b0+(\d+)/g, "$1")
    .toUpperCase();
}

function normalizeRoadType(value: string) {
  const normalized = normalizeAddressToken(value);
  if (normalized.includes("CARRERA")) return "CARRERA";
  if (normalized.includes("CALLE")) return "CALLE";
  if (normalized.includes("TRANSVERSAL")) return "TRANSVERSAL";
  if (normalized.includes("DIAGONAL")) return "DIAGONAL";
  return normalized;
}

function parseBogotaAddress(input: string): ParsedBogotaAddress | null {
  const normalized = normalizeBogotaAddress(input);
  const match = normalized.match(
    /^(Avenida Carrera|Avenida Calle|Carrera|Calle|Transversal|Diagonal)\s+(\d+[a-z]?)(?:\s+(bis))?(?:\s+(sur|este))?\s*#?\s*(\d+[a-z]?)(?:\s+(bis))?(?:\s+(sur|este))?\s*(?:-|\s)\s*(\d+[a-z]?)/i,
  );
  if (!match) return null;

  const roadType = match[1];
  const principal = [match[2], match[3], match[4]].filter(Boolean).join(" ");
  const cross = [match[5], match[6], match[7]].filter(Boolean).join(" ");
  const distance = match[8];

  return {
    roadType,
    principal: normalizeAddressToken(principal),
    cross: normalizeAddressToken(cross),
    distance: normalizeAddressToken(distance),
    canonical: `${roadType} ${normalizeAddressToken(principal)} #${normalizeAddressToken(cross)}-${normalizeAddressToken(distance)}`,
  };
}

function arcgisQueryVariants(address: string, city: string) {
  const parsed = parseBogotaAddress(address);
  if (!parsed) return uniqueQueries(address, city);

  const plainRoad = parsed.roadType === "Avenida Carrera" ? "Carrera" : parsed.roadType === "Avenida Calle" ? "Calle" : parsed.roadType;
  return Array.from(
    new Set([
      `${parsed.canonical}, ${city}, Colombia`,
      `${plainRoad} ${parsed.principal} #${parsed.cross}-${parsed.distance}, ${city}, Colombia`,
      `${plainRoad} ${parsed.principal} ${parsed.cross} ${parsed.distance}, ${city}, Colombia`,
      `${parsed.canonical}, Bogota, Colombia`,
      `${plainRoad} ${parsed.principal} ${parsed.cross} ${parsed.distance}, Bogota, Colombia`,
    ]),
  );
}

function uniqueQueries(address: string, city: string) {
  const normalized = normalizeBogotaAddress(address);
  const withoutHash = normalized.replace("#", " ");
  return Array.from(
    new Set([
      `${address}, ${city}, Colombia`,
      `${normalized}, ${city}, Colombia`,
      `${withoutHash}, ${city}, Colombia`,
      `${normalized}, Bogota, Colombia`,
      `${withoutHash}, Bogota, Colombia`,
    ]),
  );
}

type NominatimItem = {
  display_name?: string;
  lat?: string;
  lon?: string;
  class?: string;
  type?: string;
  address?: Record<string, string | undefined>;
};

type ArcgisCandidate = {
  address?: string;
  score?: number;
  location?: { x?: number; y?: number };
  attributes?: {
    Addr_type?: string;
    Match_addr?: string;
    Score?: number;
    PlaceName?: string;
    Type?: string;
  };
};

function isGenericRoadResult(item: NominatimItem) {
  return item.class === "highway";
}

function isPreciseNominatimResult(item: NominatimItem) {
  const address = item.address ?? {};
  return Boolean(
    address.house_number ||
      address.building ||
      address.residential ||
      address.amenity ||
      address.shop ||
      address.office ||
      address.tourism ||
      address.leisure ||
      (item.class && item.class !== "highway" && item.class !== "boundary" && item.class !== "place"),
  );
}

async function googleSuggestions(address: string, city: string): Promise<AddressSuggestion[]> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return [];

  const query = `${normalizeBogotaAddress(address)}, ${city}, Colombia`;
  const suggestions: AddressSuggestion[] = [];
  const seen = new Set<string>();

  const geocodeUrl = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  geocodeUrl.searchParams.set("address", query);
  geocodeUrl.searchParams.set("components", "country:CO");
  geocodeUrl.searchParams.set("key", key);

  const geocodeResponse = await fetch(geocodeUrl, { next: { revalidate: 60 * 60 * 24 * 7 } });
  if (geocodeResponse.ok) {
    const data = (await geocodeResponse.json()) as {
      results?: Array<{
        formatted_address?: string;
        partial_match?: boolean;
        geometry?: { location?: { lat?: number; lng?: number }; location_type?: string };
      }>;
    };
    for (const result of data.results ?? []) {
      const coordinates = parseCoordinates(result.geometry?.location?.lat, result.geometry?.location?.lng);
      if (!coordinates || !result.formatted_address || result.partial_match) continue;
      const key = `${coordinates.latitude}:${coordinates.longitude}`;
      if (seen.has(key)) continue;
      seen.add(key);
      suggestions.push({ ...coordinates, label: result.formatted_address, precision: result.geometry?.location_type === "ROOFTOP" ? "exacta" : "aproximada" });
    }
  }

  const placesUrl = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
  placesUrl.searchParams.set("query", query);
  placesUrl.searchParams.set("region", "co");
  placesUrl.searchParams.set("key", key);

  const placesResponse = await fetch(placesUrl, { next: { revalidate: 60 * 60 * 24 * 7 } });
  if (placesResponse.ok) {
    const data = (await placesResponse.json()) as {
      results?: Array<{ name?: string; formatted_address?: string; geometry?: { location?: { lat?: number; lng?: number } } }>;
    };
    for (const result of data.results ?? []) {
      const coordinates = parseCoordinates(result.geometry?.location?.lat, result.geometry?.location?.lng);
      const label = [result.name, result.formatted_address].filter(Boolean).join(" - ");
      if (!coordinates || !label) continue;
      const key = `${coordinates.latitude}:${coordinates.longitude}`;
      if (seen.has(key)) continue;
      seen.add(key);
      suggestions.push({ ...coordinates, label, precision: "exacta" });
    }
  }

  return suggestions.slice(0, 5);
}

function isPreciseArcgisCandidate(candidate: ArcgisCandidate) {
  const score = candidate.score ?? candidate.attributes?.Score ?? 0;
  const type = candidate.attributes?.Addr_type ?? "";
  return score >= 90 && ["PointAddress", "StreetAddress", "Subaddress", "POI"].includes(type);
}

function candidateMatchesRequestedAddress(candidate: ArcgisCandidate, requested: ParsedBogotaAddress | null) {
  if (!requested) return true;
  const candidateAddress = candidate.attributes?.Match_addr ?? candidate.address ?? "";
  const candidateParsed = parseBogotaAddress(candidateAddress);
  if (!candidateParsed) return false;

  const requestedRoad = normalizeRoadType(requested.roadType);
  const candidateRoad = normalizeRoadType(candidateParsed.roadType);
  return (
    requestedRoad === candidateRoad &&
    requested.principal === candidateParsed.principal &&
    requested.cross === candidateParsed.cross &&
    requested.distance === candidateParsed.distance
  );
}

async function arcgisSuggestions(address: string, city: string): Promise<AddressSuggestion[]> {
  const suggestions: AddressSuggestion[] = [];
  const seen = new Set<string>();
  const requested = parseBogotaAddress(address);

  for (const query of arcgisQueryVariants(address, city)) {
    const url = new URL("https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates");
    url.searchParams.set("SingleLine", query);
    url.searchParams.set("f", "json");
    url.searchParams.set("countryCode", "COL");
    url.searchParams.set("maxLocations", "5");
    url.searchParams.set("outFields", "Addr_type,Match_addr,Score,PlaceName,Type");

    const response = await fetch(url, { next: { revalidate: 60 * 60 * 24 * 7 } });
    if (!response.ok) continue;
    const data = (await response.json()) as { candidates?: ArcgisCandidate[] };

    for (const candidate of data.candidates ?? []) {
      const coordinates = parseCoordinates(candidate.location?.y, candidate.location?.x);
      if (!coordinates || !candidate.address || !isPreciseArcgisCandidate(candidate)) continue;
      if (!candidateMatchesRequestedAddress(candidate, requested)) continue;
      const key = `${coordinates.latitude}:${coordinates.longitude}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const score = candidate.score ?? candidate.attributes?.Score ?? 0;
      suggestions.push({
        ...coordinates,
        label: candidate.address,
        precision: score >= 98 ? "exacta" : "aproximada",
      });
    }

    if (suggestions.length >= 5) break;
  }

  return suggestions.slice(0, 5);
}

export async function geocodeAddress(address: string, city = "Bogota"): Promise<Coordinates> {
  const explicitCoordinates = extractCoordinatesFromText(address);
  if (explicitCoordinates) return explicitCoordinates;

  try {
    const arcgis = await arcgisSuggestions(address, city);
    if (arcgis[0]) return { latitude: arcgis[0].latitude, longitude: arcgis[0].longitude };

    const google = await googleSuggestions(address, city);
    if (google[0]) return { latitude: google[0].latitude, longitude: google[0].longitude };

    for (const query of uniqueQueries(address, city)) {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`, {
        headers: {
          "user-agent": "RCDlogiq/1.0",
        },
        next: { revalidate: 60 * 60 * 24 * 7 },
      });
      if (response.ok) {
        const data = (await response.json()) as Array<{ lat?: string; lon?: string }>;
        const first = data[0];
        const latitude = Number(first?.lat);
        const longitude = Number(first?.lon);
        if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
          return { latitude, longitude };
        }
      }
    }
  } catch {
    // Local fallback keeps the operation usable when the geocoder is offline.
  }
  return fallbackBogotaCoordinates(`${address}, ${city}, Colombia`);
}

export async function searchAddressSuggestions(address: string, city = "Bogota"): Promise<AddressSuggestion[]> {
  const explicitCoordinates = extractCoordinatesFromText(address);
  if (explicitCoordinates) {
    return [{ ...explicitCoordinates, label: `${address.trim()} (${explicitCoordinates.latitude}, ${explicitCoordinates.longitude})`, precision: "exacta" }];
  }

  try {
    const arcgis = await arcgisSuggestions(address, city);
    if (arcgis.length > 0) return arcgis;

    const google = await googleSuggestions(address, city);
    if (google.length > 0) return google;

    const suggestions: AddressSuggestion[] = [];
    const seen = new Set<string>();
    for (const query of uniqueQueries(address, city)) {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&q=${encodeURIComponent(query)}`, {
        headers: {
          "user-agent": "RCDlogiq/1.0",
        },
        next: { revalidate: 60 * 60 * 24 },
      });
      if (!response.ok) continue;
      const data = (await response.json()) as NominatimItem[];
      for (const item of data) {
        const coordinates = parseCoordinates(item.lat, item.lon);
        if (!coordinates || !item.display_name) continue;
        if (isGenericRoadResult(item) || !isPreciseNominatimResult(item)) continue;
        const key = `${coordinates.latitude}:${coordinates.longitude}`;
        if (seen.has(key)) continue;
        seen.add(key);
        suggestions.push({ ...coordinates, label: item.display_name, precision: "exacta" });
      }
      if (suggestions.length >= 5) break;
    }
    return suggestions.slice(0, 5);
  } catch {
    return [];
  }
}

