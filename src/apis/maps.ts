import axios from "axios";

export interface NearbyOffice {
  name: string;
  address: string;
  distance: string;
  mapsUrl: string;
}

const INTENT_QUERY: Record<string, string> = {
  FIR_POLICE:      "police station",
  LABOUR_WAGE:     "labour commissioner office",
  WELFARE_SCHEME:  "common service centre CSC",
  TENANCY_HOUSING: "tehsil office district court",
  CONSUMER_COURT:  "district consumer forum court",
  CIVIL_RTI:       "district legal services authority",
};

/**
 * Finds the nearest relevant government office using Nominatim / OpenStreetMap.
 * Completely free — no API key, no billing, no credit card required.
 * Rate limit: 1 request per second (fine for a WhatsApp bot).
 */
export async function findNearestOffice(
  intent: string,
  city?: string
): Promise<NearbyOffice | null> {
  const baseQuery = INTENT_QUERY[intent] || "district court";
  const query = city ? `${baseQuery} ${city} India` : `${baseQuery} India`;

  try {
    const res = await axios.get("https://nominatim.openstreetmap.org/search", {
      params: {
        q:            query,
        format:       "json",
        limit:        3,
        addressdetails: 1,
        countrycodes: "in",
      },
      headers: {
        // Nominatim policy requires a descriptive User-Agent
        "User-Agent":      "NyayaBot/1.0 (free legal aid India; bhavya.tejasvi@influencer.in)",
        "Accept-Language": "en",
      },
      timeout: 8000,
    });

    const results = res.data as Array<{
      display_name: string;
      address?: Record<string, string>;
      lat: string;
      lon: string;
    }>;

    if (!results?.length) return staticFallback(intent);

    const place = results[0];
    const name =
      place.address?.amenity ||
      place.address?.office  ||
      place.display_name.split(",")[0];
    const shortAddress = place.display_name.split(",").slice(0, 4).join(", ");

    return {
      name,
      address:  shortAddress,
      distance: "Nearby",
      mapsUrl:  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.display_name)}`,
    };
  } catch {
    return staticFallback(intent);
  }
}

function staticFallback(intent: string): NearbyOffice {
  const fallbacks: Record<string, NearbyOffice> = {
    FIR_POLICE: {
      name: "Nearest Police Station",
      address: "Search 'police station near me'",
      distance: "",
      mapsUrl: "https://www.google.com/maps/search/police+station+near+me",
    },
    LABOUR_WAGE: {
      name: "Labour Commissioner Office",
      address: "Search 'labour commissioner office near me'",
      distance: "",
      mapsUrl: "https://www.google.com/maps/search/labour+commissioner+office+near+me",
    },
    WELFARE_SCHEME: {
      name: "Common Service Centre (CSC)",
      address: "locator.csccloud.in",
      distance: "",
      mapsUrl: "https://locator.csccloud.in",
    },
    TENANCY_HOUSING: {
      name: "Rent Control Tribunal / Tehsil Office",
      address: "Search 'tehsil office near me'",
      distance: "",
      mapsUrl: "https://www.google.com/maps/search/tehsil+office+near+me",
    },
    CONSUMER_COURT: {
      name: "District Consumer Disputes Redressal Commission",
      address: "Search 'district consumer forum near me'",
      distance: "",
      mapsUrl: "https://www.google.com/maps/search/district+consumer+forum+near+me",
    },
    CIVIL_RTI: {
      name: "District Legal Services Authority (DLSA)",
      address: "Search 'DLSA near me'",
      distance: "",
      mapsUrl: "https://www.google.com/maps/search/district+legal+services+authority+near+me",
    },
  };

  return fallbacks[intent] || {
    name: "Nearest District Court",
    address: "Search 'district court near me'",
    distance: "",
    mapsUrl: "https://www.google.com/maps/search/district+court+near+me",
  };
}
