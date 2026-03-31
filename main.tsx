import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ButtonHTMLAttributes, ChangeEvent, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { createRoot } from "react-dom/client";
import { motion } from "framer-motion";
import { translations, type Language, type TKey } from "./i18n";
import "./index.css";

/* ═══════════════════════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════════════════════ */
type ThemeMode = "light" | "dark";
type ViewMode = "user" | "admin";
type TripTab = "overview" | "travelers" | "itinerary" | "expenses" | "luggage" | "settings";
type AdminTab = "trips" | "travelers" | "luggage" | "website" | "password";
type UserSection = "dashboard" | "trips";

type Profile = {
  id: string; accountName: string; firstName: string; lastName: string;
  email: string; phone: string; password: string;
  dateOfBirth?: string;
  nationality?: string; passportNumber?: string; passportExpiryDate?: string; dietaryNotes?: string;
  emergencyContact?: string; homeAirport?: string;
};

type TravelNote = {
  id: string; text: string; attachments: {url:string;name:string}[];
  createdAt: string; authorId: string; authorName: string;
};

type Expense = {
  id: string; date: string; title: string; amount: number; currency: string;
  category: string; paidBy: string; participants: string[]; notes: string;
};

type PackingItem = {
  id: string; label: string; category: string; assignedTo: string; packed: boolean;
};

type LuggageCategory = { id: string; name: string; defaultItems: string[]; };

type FlightLeg = {
  id: string; airline: string; flightNumber: string; departureAirport: string; arrivalAirport: string;
  departureTime: string; arrivalTime: string; terminal: string; bookingReference: string;
  notes: string;
};

type HotelStay = {
  id: string; hotelName: string; hotelAddress: string; roomType: string; checkIn: string; checkOut: string;
  confirmationCode: string; contact: string; notes: string;
};

type TransitLeg = { duration: string; details: string; };

type ItineraryItem = {
  id: string; day: number; order: number; startTime: string; endTime: string; endDayOffset?: number; title: string; stopLocation: string; transport: string; details: string;
  photo?: string; mapUrl?: string; transitToNext?: TransitLeg;
};

type OptionalStop = {
  id: string; day: number; type: "site" | "restaurant" | "other"; title: string; location: string;
  url: string; notes: string;
};

type Trip = {
  id: string; ownerId: string; ownerName: string; title: string; location: string;
  startDate: string; endDate: string; duration: number;
  flightNumber: string; airline: string; departureAirport: string; arrivalAirport: string;
  departureTime: string; arrivalTime: string; terminal: string; bookingReference: string;
  hotelName: string; hotelAddress: string; roomType: string; checkIn: string; checkOut: string; confirmationCode: string;
  flightLegs: FlightLeg[]; hotels: HotelStay[];
  transportMode: string; notes: string;
  travelNotes: TravelNote[];
  bannerColor: string; bannerImage: string;
  members: string[]; expenses: Expense[];
  packingList: PackingItem[]; itinerary: ItineraryItem[]; optionalStops: OptionalStop[];
  createdAt: string;
  customLocation?: {name:string;lat:number;lon:number};
};

type WeatherData = {
  current: { temp: number; condition: string; wind: number; high: number; low: number };
  forecast: { date: string; high: number; low: number; condition: string }[];
  monthlyClimate?: { month:string; avgHigh:number; avgLow:number; avgRain:number }[];
};

type GeoPoint = { name: string; lat: number; lon: number };

type WeatherApiSettings = { providerName: string; geocodeUrl: string; forecastUrl: string; flightLookupUrl: string; hotelLookupUrl: string; };
type SiteSettings = {
  siteName: string; description: string; weatherApi: WeatherApiSettings;
  luggageCategories: LuggageCategory[];
};
type CloudSyncEnvelope<T> = {
  value: T;
  updatedAt: string;
  deviceId: string;
};
type SharedPersistMeta = {
  hydrated: boolean;
  lastError: string;
  syncNow: () => Promise<void>;
};

/* ═══════════════════════════════════════════════════════════════════════════════
   CONSTANTS & DEFAULTS
   ═══════════════════════════════════════════════════════════════════════════════ */
const CURRENCIES = ["USD","EUR","GBP","JPY","HKD","SGD","AUD","CNY","TWD","KRW","THB","MYR","CAD","CHF"];
const EXPENSE_CATS = ["Food","Transport","Accommodation","Activities","Shopping","Other"];
const ITINERARY_TRANSPORT_OPTIONS = ["Train","Bus","Flight","Taxi","Rental Car","Walk","Ferry","Other"];
const weatherCodeMap: Record<number,string> = {
  0:"Clear sky",1:"Mostly clear",2:"Partly cloudy",3:"Overcast",
  45:"Fog",48:"Rime fog",51:"Light drizzle",53:"Drizzle",55:"Dense drizzle",
  61:"Light rain",63:"Rain",65:"Heavy rain",71:"Light snow",73:"Snow",
  75:"Heavy snow",80:"Rain showers",81:"Heavy showers",82:"Violent showers",95:"Thunderstorm",
};
const weatherEmoji: Record<string,string> = {
  "Clear sky":"☀️","Mostly clear":"🌤️","Partly cloudy":"⛅","Overcast":"☁️",
  "Fog":"🌫️","Rime fog":"🌫️","Light drizzle":"🌦️","Drizzle":"🌧️","Dense drizzle":"🌧️",
  "Light rain":"🌦️","Rain":"🌧️","Heavy rain":"⛈️","Light snow":"🌨️","Snow":"❄️",
  "Heavy snow":"❄️","Rain showers":"🌦️","Heavy showers":"⛈️","Violent showers":"⛈️","Thunderstorm":"⛈️",
};

const defaultLuggageCats: LuggageCategory[] = [
  { id:"cat-docs", name:"Documents", defaultItems:["Passport","Travel insurance","Flight tickets","Hotel booking"] },
  { id:"cat-clothes", name:"Clothing", defaultItems:["T-shirts","Pants","Underwear & socks","Jacket"] },
  { id:"cat-toiletries", name:"Toiletries", defaultItems:["Toothbrush & paste","Shampoo","Sunscreen","Medications"] },
  { id:"cat-electronics", name:"Electronics", defaultItems:["Phone charger","Power adapter","Earphones","Power bank"] },
  { id:"cat-misc", name:"Misc", defaultItems:["Reusable bag","Snacks","Travel pillow"] },
];

const defaultSiteSettings: SiteSettings = {
  siteName:"TravelPlan",
  description:"Plan trips together — itineraries, expenses, luggage & more.",
  weatherApi:{
    providerName:"Open-Meteo",
    geocodeUrl:"https://geocoding-api.open-meteo.com/v1/search?name={query}&count=1&language=en&format=json",
    forecastUrl:"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=temperature_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,weather_code&forecast_days=7&timezone=auto",
    flightLookupUrl:"https://api.adsbdb.com/v0/callsign/{flightNumber}",
    hotelLookupUrl:"https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=hotel%20{query}",
  },
  luggageCategories: defaultLuggageCats,
};

const SK = {
  profiles:"tp-profiles", trips:"tp-trips", adminPw:"tp-admin-pw",
  adminAuth:"tp-admin-auth", userId:"tp-current-user", theme:"tp-theme",
  site:"tp-site-settings", lang:"tp-lang",
};

const HERO_IMAGES = [
  "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1600&q=80",
  "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=1600&q=80",
  "https://images.unsplash.com/photo-1530789253388-582c481c54b0?w=1600&q=80",
  "https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=1600&q=80",
];

/* ═══════════════════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════════════════ */
const uid = (p:string)=>`${p}-${Math.random().toString(36).slice(2,10)}`;
const tripCode = ()=>Math.random().toString(36).slice(2,8).toUpperCase();
const cx = (...v:(string|false|null|undefined)[])=>v.filter(Boolean).join(" ");
const dn = (p:Pick<Profile,"firstName"|"lastName">)=>`${p.firstName} ${p.lastName}`.trim();
const fmtDate = (v:string)=>v ? new Date(v).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}) : "—";
const fmtCur = (n:number,c="USD")=>new Intl.NumberFormat("en-US",{style:"currency",currency:c,maximumFractionDigits:2}).format(n);
const upper = (v:string)=>v.trim().toUpperCase();
const normalizeName = (v:string)=>upper(v);
const normalizeAirport = (v:string)=>upper(v).slice(0,3);

function calcDuration(s:string,e:string){
  if(!s||!e) return 1;
  return Math.max(1, Math.ceil((new Date(e).getTime()-new Date(s).getTime())/(864e5))+1);
}

function usePersist<T>(key:string,init:T){
  const [s,set]=useState<T>(()=>{try{const r=localStorage.getItem(key);return r?JSON.parse(r):init;}catch{return init;}});
  useEffect(()=>{try{localStorage.setItem(key,JSON.stringify(s));}catch{}},[key,s]);
  return [s,set] as const;
}

const CLOUD_DEVICE_ID_KEY = "tp-cloud-device-id";
const CLOUD_WORKER_ENDPOINT_KEY = "tp-cloud-worker-endpoint";
const CLOUD_CF_ACCOUNT_ID_KEY = "tp-cloudflare-account-id";
const CLOUD_D1_DATABASE_ID_KEY = "tp-cloudflare-d1-database-id";
const CLOUD_CF_API_TOKEN_KEY = "tp-cloudflare-api-token";
const DEFAULT_CLOUDFLARE_WORKER_ENDPOINT = "https://travel-planner-ai-storage.simpsonlee71.workers.dev";
const DEFAULT_CLOUDFLARE_ACCOUNT_ID = "64ba8506f5d201ceed54c05d58743ce4";
const DEFAULT_CLOUDFLARE_D1_DATABASE_ID = "f46d6590-0fec-4df0-b31e-49dbf4b25476";
const DEFAULT_CLOUDFLARE_API_TOKEN = "cfut_DNH2yHaUgo4LdhY9E2MKOfSslbVnjOzip9SuJheQ940ba29c";
const DEPLOYED_CLOUDFLARE_WORKER_ENDPOINT = (import.meta.env.VITE_CLOUDFLARE_WORKER_ENDPOINT ?? DEFAULT_CLOUDFLARE_WORKER_ENDPOINT).trim();
const DEPLOYED_CLOUDFLARE_ACCOUNT_ID = (import.meta.env.VITE_CLOUDFLARE_ACCOUNT_ID ?? DEFAULT_CLOUDFLARE_ACCOUNT_ID).trim();
const DEPLOYED_CLOUDFLARE_D1_DATABASE_ID = (import.meta.env.VITE_CLOUDFLARE_D1_DATABASE_ID ?? DEFAULT_CLOUDFLARE_D1_DATABASE_ID).trim();
const DEPLOYED_CLOUDFLARE_API_TOKEN = (import.meta.env.VITE_CLOUDFLARE_API_TOKEN ?? DEFAULT_CLOUDFLARE_API_TOKEN).trim();
const CLOUD_SHARED_KEYS = new Set([SK.profiles,SK.trips,SK.adminPw,SK.site]);
const CLOUD_SYNC_INTERVAL_MS = 15000;

type CloudD1Config = {
  accountId: string;
  databaseId: string;
  apiToken: string;
};

function getCloudD1Config(): CloudD1Config{
  try{
    const accountId = localStorage.getItem(CLOUD_CF_ACCOUNT_ID_KEY)?.trim() || DEPLOYED_CLOUDFLARE_ACCOUNT_ID;
    const databaseId = localStorage.getItem(CLOUD_D1_DATABASE_ID_KEY)?.trim() || DEPLOYED_CLOUDFLARE_D1_DATABASE_ID;
    const apiToken = localStorage.getItem(CLOUD_CF_API_TOKEN_KEY)?.trim() || DEPLOYED_CLOUDFLARE_API_TOKEN;
    return { accountId, databaseId, apiToken };
  }catch{
    return {
      accountId: DEPLOYED_CLOUDFLARE_ACCOUNT_ID,
      databaseId: DEPLOYED_CLOUDFLARE_D1_DATABASE_ID,
      apiToken: DEPLOYED_CLOUDFLARE_API_TOKEN,
    };
  }
}

function setCloudD1Config(config:CloudD1Config){
  localStorage.setItem(CLOUD_CF_ACCOUNT_ID_KEY,config.accountId.trim());
  localStorage.setItem(CLOUD_D1_DATABASE_ID_KEY,config.databaseId.trim());
  localStorage.setItem(CLOUD_CF_API_TOKEN_KEY,config.apiToken.trim());
}

function getCloudWorkerEndpoint(){
  try{
    const override = localStorage.getItem(CLOUD_WORKER_ENDPOINT_KEY)?.trim();
    return override || DEPLOYED_CLOUDFLARE_WORKER_ENDPOINT;
  }catch{
    return DEPLOYED_CLOUDFLARE_WORKER_ENDPOINT;
  }
}

function setCloudWorkerEndpoint(endpoint:string){
  const next = endpoint.trim();
  if(next){
    localStorage.setItem(CLOUD_WORKER_ENDPOINT_KEY,next);
    return;
  }
  localStorage.removeItem(CLOUD_WORKER_ENDPOINT_KEY);
}

async function cloudD1Query(config:CloudD1Config,sql:string,params:unknown[]=[]){
  if(!config.accountId || !config.databaseId || !config.apiToken){
    throw new Error("Cloudflare D1 config missing. Set account id, database id, and API token.");
  }

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/d1/database/${config.databaseId}/query`;
  const res = await fetch(endpoint,{
    method:"POST",
    headers:{
      "content-type":"application/json",
      "authorization":`Bearer ${config.apiToken}`,
    },
    body:JSON.stringify({sql,params}),
  });
  const data = await res.json();
  if(!res.ok || !data?.success){
    const err = data?.errors?.[0]?.message ?? data?.messages?.[0] ?? `Cloudflare D1 query failed (${res.status})`;
    throw new Error(err);
  }

  const first = Array.isArray(data.result) ? data.result[0] : data.result;
  if(first?.success === false){
    const err = first?.error ?? first?.errors?.[0]?.message ?? "Cloudflare D1 statement failed.";
    throw new Error(err);
  }
  return first;
}

async function ensureCloudD1Schema(config:CloudD1Config){
  await cloudD1Query(
    config,
    "CREATE TABLE IF NOT EXISTS ai_storage (storage_key TEXT PRIMARY KEY, storage_value TEXT NOT NULL, updated_at TEXT NOT NULL);"
  );
  await cloudD1Query(
    config,
    "CREATE INDEX IF NOT EXISTS idx_ai_storage_updated_at ON ai_storage(updated_at);"
  );
}

async function verifyCloudD1Config(config:CloudD1Config){
  await ensureCloudD1Schema(config);
  await cloudD1Query(config,"SELECT 1 AS ok");
}

async function verifyCloudWorkerEndpoint(){
  const endpoint = getCloudWorkerEndpoint();
  if(!endpoint) throw new Error("Cloud worker endpoint missing.");
  const response = await fetch(endpoint,{
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({ id:crypto.randomUUID(), action:"get", key:"tp-sync-healthcheck" }),
  });
  const payload = await response.json();
  if(!response.ok || payload?.ok !== true){
    throw new Error(payload?.error ?? `Cloud worker request failed (${response.status})`);
  }
}

async function cloudStorageRequest(action:string,key:string,value?:unknown){
  const workerEndpoint = getCloudWorkerEndpoint();
  const workerErrors: string[] = [];

  if(workerEndpoint){
    try{
      const resp = await fetch(workerEndpoint,{
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({ id:crypto.randomUUID(), action, key, value }),
      });
      const payload = await resp.json();
      if(!resp.ok || payload?.ok !== true){
        throw new Error(payload?.error ?? `Cloud worker request failed (${resp.status})`);
      }
      return payload?.data;
    }catch(error){
      workerErrors.push(error instanceof Error ? error.message : "Unknown worker fetch error.");
    }
  }

  const config = getCloudD1Config();
  if(config.accountId && config.databaseId && config.apiToken){
    await ensureCloudD1Schema(config);

    if(action==="set"){
      const now = new Date().toISOString();
      await cloudD1Query(
        config,
        `INSERT INTO ai_storage (storage_key, storage_value, updated_at)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(storage_key) DO UPDATE SET storage_value=excluded.storage_value, updated_at=excluded.updated_at`,
        [key, JSON.stringify(value), now]
      );
      return { key, value };
    }

    if(action==="get"){
      const result = await cloudD1Query(
        config,
        "SELECT storage_value FROM ai_storage WHERE storage_key = ?1 LIMIT 1",
        [key]
      );
      const row = result?.results?.[0] as { storage_value?: string } | undefined;
      if(!row || typeof row.storage_value !== "string"){
        return { key, value: undefined, exists: false };
      }
      try{
        return { key, value: JSON.parse(row.storage_value), exists: true };
      }catch{
        return { key, value: row.storage_value, exists: true };
      }
    }
  }

  if(action!=="set" && action!=="get"){
    throw new Error(`Unsupported cloud storage action: ${action}`);
  }

  const workerMessage = workerErrors.length>0 ? ` Worker endpoint error: ${workerErrors[0]}` : "";
  throw new Error(`Cloud sync failed: unable to reach worker or D1 configuration is incomplete.${workerMessage}`);
}

function getCloudDeviceId(){
  try{
    const existing = localStorage.getItem(CLOUD_DEVICE_ID_KEY)?.trim();
    if(existing) return existing;
    const created = crypto.randomUUID();
    localStorage.setItem(CLOUD_DEVICE_ID_KEY,created);
    return created;
  }catch{
    return crypto.randomUUID();
  }
}

function parseCloudEnvelope<T>(value:unknown): CloudSyncEnvelope<T> | null{
  if(!value || typeof value !== "object") return null;
  const candidate = value as Partial<CloudSyncEnvelope<T>>;
  if(typeof candidate.updatedAt !== "string" || typeof candidate.deviceId !== "string" || !("value" in candidate)) return null;
  return candidate as CloudSyncEnvelope<T>;
}

function useSharedPersist<T>(key:string,init:T){
  const [s,set]=usePersist<T>(key,init);
  const stateRef = useRef(s);
  const hydratedRef = useRef(false);
  const skipNextPushRef = useRef(false);
  const latestRemoteAtRef = useRef("");
  const deviceIdRef = useRef(getCloudDeviceId());
  const [hydrated,setHydrated] = useState(!CLOUD_SHARED_KEYS.has(key));
  const [lastError,setLastError] = useState("");

  useEffect(()=>{ stateRef.current=s; },[s]);

  const pushRemote = useCallback(async()=>{
    if(!CLOUD_SHARED_KEYS.has(key)) return;

    const payload: CloudSyncEnvelope<T> = {
      value: stateRef.current,
      updatedAt: new Date().toISOString(),
      deviceId: deviceIdRef.current,
    };

    await cloudStorageRequest("set",key,payload);
    latestRemoteAtRef.current = payload.updatedAt;
    setLastError("");
  },[key]);

  const pullRemote = useCallback(async()=>{
    if(!CLOUD_SHARED_KEYS.has(key)) return;

    const remote = await cloudStorageRequest("get",key);
    if(!remote?.exists){
      await pushRemote();
      hydratedRef.current = true;
      setHydrated(true);
      setLastError("");
      return;
    }

    const envelope = parseCloudEnvelope<T>(remote.value);
    const remoteValue = envelope ? envelope.value : remote.value as T;
    const remoteUpdatedAt = envelope?.updatedAt ?? "";
    const localSerialized = JSON.stringify(stateRef.current);
    const remoteSerialized = JSON.stringify(remoteValue);
    const shouldAdoptRemote =
      !hydratedRef.current ||
      (remoteUpdatedAt && remoteUpdatedAt > latestRemoteAtRef.current && remoteSerialized !== localSerialized);

    if(remoteUpdatedAt && remoteUpdatedAt > latestRemoteAtRef.current){
      latestRemoteAtRef.current = remoteUpdatedAt;
    }

    if(shouldAdoptRemote && remoteSerialized !== localSerialized){
      skipNextPushRef.current = true;
      set(remoteValue);
    }

    hydratedRef.current = true;
    setHydrated(true);
    setLastError("");
  },[key,pushRemote,set]);

  useEffect(()=>{
    (async()=>{
      try{
        await pullRemote();
      }catch(error){
        setLastError(error instanceof Error ? error.message : "Cloud sync failed.");
        hydratedRef.current = true;
        setHydrated(true);
      }
    })();
    // run only once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[key,pullRemote]);

  useEffect(()=>{
    if(!CLOUD_SHARED_KEYS.has(key)) return;
    if(!hydratedRef.current) return;
    if(skipNextPushRef.current){
      skipNextPushRef.current = false;
      return;
    }
    pushRemote().catch((error)=>{
      setLastError(error instanceof Error ? error.message : "Cloud sync failed.");
    });
  },[key,pushRemote,s]);

  useEffect(()=>{
    if(!CLOUD_SHARED_KEYS.has(key) || typeof window === "undefined") return;

    const syncNow = ()=>{ pullRemote().catch(()=>{}); };
    const handleVisibility = ()=>{ if(document.visibilityState === "visible") syncNow(); };
    const handleStorage = (event:StorageEvent)=>{
      if(event.key === key && event.newValue){
        try{
          const nextValue = JSON.parse(event.newValue) as T;
          if(JSON.stringify(nextValue) !== JSON.stringify(stateRef.current)){
            skipNextPushRef.current = true;
            set(nextValue);
          }
        }catch{}
      }
      if(event.key === CLOUD_WORKER_ENDPOINT_KEY || event.key === CLOUD_CF_ACCOUNT_ID_KEY || event.key === CLOUD_D1_DATABASE_ID_KEY || event.key === CLOUD_CF_API_TOKEN_KEY){
        syncNow();
      }
    };

    const timer = window.setInterval(syncNow,CLOUD_SYNC_INTERVAL_MS);
    window.addEventListener("focus",syncNow);
    window.addEventListener("online",syncNow);
    window.addEventListener("storage",handleStorage);
    document.addEventListener("visibilitychange",handleVisibility);

    return ()=>{
      window.clearInterval(timer);
      window.removeEventListener("focus",syncNow);
      window.removeEventListener("online",syncNow);
      window.removeEventListener("storage",handleStorage);
      document.removeEventListener("visibilitychange",handleVisibility);
    };
  },[key,pullRemote,set]);

  const syncNow = useCallback(async()=>{
    await pullRemote();
  },[pullRemote]);

  return [s,set,{hydrated,lastError,syncNow}] as const;
}

function useT(lang:Language){ return (k:TKey)=>translations[lang][k]; }

function copyText(v:string){ navigator.clipboard?.writeText(v).catch(()=>{}); }

function buildUrl(tpl:string,rep:Record<string,string|number>){
  return Object.entries(rep).reduce((c,[k,v])=>c.split(`{${k}}`).join(k==="query"?encodeURIComponent(String(v)):String(v)),tpl);
}

function normProfile(i:unknown):Profile{
  const p=(i??{}) as Partial<Profile>;
  return { id:p.id??uid("u"), accountName:upper(p.accountName??""), firstName:normalizeName(p.firstName??""),
    lastName:normalizeName(p.lastName??""), email:p.email??"", phone:p.phone??"", password:p.password??"", dateOfBirth:p.dateOfBirth??"",
    nationality:p.nationality??"", passportNumber:p.passportNumber??"", passportExpiryDate:p.passportExpiryDate??"",
    dietaryNotes:p.dietaryNotes??"", emergencyContact:p.emergencyContact??"", homeAirport:normalizeAirport(p.homeAirport??"HKG")||"HKG" };
}

function normTrip(i:unknown):Trip{
  const t=(i??{}) as Partial<Trip>;
  const start=t.startDate??""; const end=t.endDate??"";
  const rawItinerary=Array.isArray(t.itinerary)?t.itinerary:[];
  const legacyFlight = t.airline || t.flightNumber || t.departureAirport || t.arrivalAirport || t.departureTime || t.arrivalTime || t.terminal || t.bookingReference;
  const legacyHotel = t.hotelName || t.hotelAddress || t.roomType || t.checkIn || t.checkOut || t.confirmationCode;
  const flightLegs = Array.isArray(t.flightLegs) && t.flightLegs.length > 0
    ? t.flightLegs
    : legacyFlight
      ? [{
          id: uid("flt"), airline: t.airline ?? "", flightNumber: t.flightNumber ?? "", departureAirport: t.departureAirport ?? "",
          arrivalAirport: t.arrivalAirport ?? "", departureTime: t.departureTime ?? "", arrivalTime: t.arrivalTime ?? "",
          terminal: t.terminal ?? "", bookingReference: t.bookingReference ?? "", notes: "",
        }]
      : [];
  const hotels = Array.isArray(t.hotels) && t.hotels.length > 0
    ? t.hotels
    : legacyHotel
      ? [{
          id: uid("htl"), hotelName: t.hotelName ?? "", hotelAddress: t.hotelAddress ?? "", roomType: t.roomType ?? "",
          checkIn: t.checkIn ?? "", checkOut: t.checkOut ?? "", confirmationCode: t.confirmationCode ?? "", contact: "", notes: "",
        }]
      : [];
  return { id:t.id??tripCode(), ownerId:t.ownerId??"", ownerName:t.ownerName??"",
    title:t.title??"Untitled", location:t.location??"", startDate:start, endDate:end,
    duration:t.duration??calcDuration(start,end),
    flightNumber:t.flightNumber??"", airline:t.airline??"", departureAirport:t.departureAirport??"", arrivalAirport:t.arrivalAirport??"",
    departureTime:t.departureTime??"", arrivalTime:t.arrivalTime??"", terminal:t.terminal??"", bookingReference:t.bookingReference??"",
    hotelName:t.hotelName??"", hotelAddress:t.hotelAddress??"", roomType:t.roomType??"", checkIn:t.checkIn??"", checkOut:t.checkOut??"", confirmationCode:t.confirmationCode??"",
    flightLegs: flightLegs.map((leg, index) => ({
      id: leg.id ?? uid(`flt-${index}`), airline: leg.airline ?? "", flightNumber: leg.flightNumber ?? "", departureAirport: leg.departureAirport ?? "",
      arrivalAirport: leg.arrivalAirport ?? "", departureTime: leg.departureTime ?? "", arrivalTime: leg.arrivalTime ?? "", terminal: leg.terminal ?? "",
      bookingReference: leg.bookingReference ?? "", notes: leg.notes ?? "",
    })),
    hotels: hotels.map((hotel, index) => ({
      id: hotel.id ?? uid(`htl-${index}`), hotelName: hotel.hotelName ?? "", hotelAddress: hotel.hotelAddress ?? "", roomType: hotel.roomType ?? "",
      checkIn: hotel.checkIn ?? "", checkOut: hotel.checkOut ?? "", confirmationCode: hotel.confirmationCode ?? "", contact: hotel.contact ?? "", notes: hotel.notes ?? "",
    })),
    transportMode:t.transportMode??"Transit", notes:t.notes??"",
    travelNotes:Array.isArray(t.travelNotes)?t.travelNotes:[],
    bannerColor:t.bannerColor??"#2563eb", bannerImage:t.bannerImage??"",
    members:Array.isArray(t.members)?t.members:[], expenses:Array.isArray(t.expenses)?t.expenses:[],
    packingList:Array.isArray(t.packingList)?t.packingList:[],
    itinerary:rawItinerary.map((item,index)=>({
      ...(item as ItineraryItem),
      order: typeof (item as ItineraryItem).order === "number" ? (item as ItineraryItem).order : index + 1,
      startTime: (item as ItineraryItem).startTime ?? (item as {time?:string}).time ?? "",
      endTime: (item as ItineraryItem).endTime ?? (item as {time?:string}).time ?? "",
      endDayOffset: (item as ItineraryItem).endDayOffset ?? 0,
      stopLocation: (item as ItineraryItem).stopLocation ?? "",
      photo: (item as ItineraryItem).photo ?? "",
      mapUrl: (item as ItineraryItem).mapUrl ?? "",
      transitToNext: (item as ItineraryItem).transitToNext ?? { duration: "", details: "" },
    })),
    optionalStops: Array.isArray((t as Partial<Trip>).optionalStops) ? (t as Partial<Trip>).optionalStops!.map((stop, index) => ({
      id: stop.id ?? uid(`opt-${index}`), day: typeof stop.day === "number" ? stop.day : 1,
      type: stop.type === "restaurant" || stop.type === "other" ? stop.type : "site",
      title: stop.title ?? "", location: stop.location ?? "", url: stop.url ?? "", notes: stop.notes ?? "",
    })) : [],
    createdAt:t.createdAt??new Date().toISOString(),
    customLocation:t.customLocation };
}

function normSite(i:unknown):SiteSettings{
  const s=(i??{}) as Partial<SiteSettings>&{weatherApi?:Partial<WeatherApiSettings>};
  return {
    siteName:s.siteName??defaultSiteSettings.siteName,
    description:s.description??defaultSiteSettings.description,
    weatherApi:{
      providerName:s.weatherApi?.providerName??defaultSiteSettings.weatherApi.providerName,
      geocodeUrl:s.weatherApi?.geocodeUrl??defaultSiteSettings.weatherApi.geocodeUrl,
      forecastUrl:s.weatherApi?.forecastUrl??defaultSiteSettings.weatherApi.forecastUrl,
      flightLookupUrl:s.weatherApi?.flightLookupUrl??defaultSiteSettings.weatherApi.flightLookupUrl,
      hotelLookupUrl:s.weatherApi?.hotelLookupUrl??defaultSiteSettings.weatherApi.hotelLookupUrl,
    },
    luggageCategories:Array.isArray(s.luggageCategories)&&s.luggageCategories.length>0?s.luggageCategories:defaultLuggageCats,
  };
}

function settlements(trip:Trip,profiles:Profile[]){
  const mems=trip.members.map(id=>profiles.find(p=>p.id===id)).filter(Boolean) as Profile[];
  const led=new Map<string,{name:string;paid:number;share:number}>();
  for(const m of mems) led.set(m.id,{name:dn(m),paid:0,share:0});
  for(const e of trip.expenses){
    const payer=led.get(e.paidBy); if(payer) payer.paid+=e.amount;
    const inc=e.participants.length?e.participants:mems.map(m=>m.id);
    const each=e.amount/(inc.length||1);
    for(const pid of inc){const x=led.get(pid);if(x) x.share+=each;}
  }
  const bal=[...led.entries()].map(([id,r])=>({id,name:r.name,paid:r.paid,share:r.share,net:+(r.paid-r.share).toFixed(2)}));
  const cred=bal.filter(b=>b.net>0.01).map(b=>({...b})).sort((a,b)=>b.net-a.net);
  const debt=bal.filter(b=>b.net<-0.01).map(b=>({...b,debt:Math.abs(b.net)})).sort((a,b)=>b.debt-a.debt);
  const sett:{from:string;to:string;amount:number}[]=[];
  for(const d of debt){let rem=d.debt;for(const c of cred){if(rem<=0.01||c.net<=0.01)continue;const a=Math.min(rem,c.net);sett.push({from:d.name,to:c.name,amount:+a.toFixed(2)});rem-=a;c.net-=a;}}
  return {total:trip.expenses.reduce((s,e)=>s+e.amount,0),bal,sett};
}

function tripFlightSummary(trip:Trip){
  if (trip.flightLegs.length > 0) {
    const firstLeg = trip.flightLegs[0];
    return [
      trip.flightLegs.map(leg=>leg.flightNumber).filter(Boolean).join(", ") || (trip.flightLegs.length > 1 ? `${trip.flightLegs.length} legs` : "1 leg"),
      [firstLeg.airline].filter(Boolean).join(" "),
      firstLeg.departureAirport && firstLeg.arrivalAirport ? `${firstLeg.departureAirport} -> ${firstLeg.arrivalAirport}` : "",
    ].filter(Boolean);
  }
  return [trip.airline, trip.flightNumber, trip.departureAirport && trip.arrivalAirport ? `${trip.departureAirport} -> ${trip.arrivalAirport}` : ""].filter(Boolean);
}

function tripHotelSummary(trip:Trip){
  if (trip.hotels.length > 0) {
    const firstHotel = trip.hotels[0];
    return [trip.hotels.length > 1 ? `${trip.hotels.length} stays` : "1 stay", firstHotel.hotelName, firstHotel.roomType].filter(Boolean);
  }
  return [trip.hotelName, trip.roomType, trip.hotelAddress].filter(Boolean);
}

function escapeHtml(value:string){
  return value
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#39;");
}

function pdfList(items:string[]){
  return items.length ? `<ul>${items.map(item=>`<li>${escapeHtml(item)}</li>`).join("")}</ul>` : '<p class="muted">—</p>';
}

function exportTripToPdf(trip:Trip, members:Profile[], t:(k:TKey)=>string){
  const itineraryByDay = Array.from({length:trip.duration}, (_,index)=>index+1).map(day=>({
    day,
    items: trip.itinerary.filter(item=>item.day===day).sort((a,b)=>a.order-b.order),
    optionalStops: trip.optionalStops.filter(stop=>stop.day===day),
  }));
  const expensesTotal = trip.expenses.reduce((sum, expense)=>sum + expense.amount, 0);
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(trip.title)} PDF</title>
    <style>
      :root { color-scheme: light; }
      * { box-sizing: border-box; }
      body { margin: 0; padding: 32px; font-family: Inter, Arial, sans-serif; color: #0f172a; background: #f8fafc; }
      h1,h2,h3,p { margin: 0; }
      .hero { padding: 28px; border-radius: 24px; background: linear-gradient(135deg, #1d4ed8, #7c3aed); color: white; }
      .hero p { margin-top: 8px; opacity: 0.92; }
      .section { margin-top: 22px; background: white; border: 1px solid #dbe3f0; border-radius: 20px; padding: 20px; page-break-inside: avoid; }
      .section-title { font-size: 20px; font-weight: 800; margin-bottom: 14px; }
      .grid { display: grid; gap: 12px; }
      .grid.cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .grid.cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .tile { border: 1px solid #dbe3f0; border-radius: 16px; padding: 14px; background: #f8fafc; min-height: 88px; }
      .label { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: #64748b; margin-bottom: 6px; }
      .value { font-size: 15px; line-height: 1.5; font-weight: 600; white-space: pre-wrap; word-break: break-word; }
      .muted { color: #64748b; font-size: 13px; }
      .card { border: 1px solid #dbe3f0; border-radius: 18px; padding: 16px; margin-top: 12px; page-break-inside: avoid; }
      .row { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
      .route { font-size: 18px; font-weight: 800; margin-top: 6px; }
      .pill { display: inline-block; border-radius: 999px; padding: 6px 10px; background: #dbeafe; color: #1d4ed8; font-size: 12px; font-weight: 700; }
      ul { margin: 10px 0 0; padding-left: 18px; }
      li { margin-top: 6px; line-height: 1.45; }
      .day { margin-top: 18px; border-top: 1px solid #e2e8f0; padding-top: 18px; }
      .day:first-of-type { margin-top: 0; border-top: 0; padding-top: 0; }
      @media print { body { background: white; padding: 18px; } .section { break-inside: avoid; } }
    </style>
  </head>
  <body>
    <section class="hero">
      <h1>${escapeHtml(trip.title)}</h1>
      <p>${escapeHtml(trip.location)} · ${escapeHtml(fmtDate(trip.startDate))} - ${escapeHtml(fmtDate(trip.endDate))} · ${trip.duration} ${escapeHtml(t("days"))}</p>
      <p>${trip.members.length} ${escapeHtml(t("members"))} · ${escapeHtml(t(getTripStatus(trip)))}</p>
    </section>

    <section class="section">
      <h2 class="section-title">${escapeHtml(t("overview"))}</h2>
      <div class="grid cols-3">
        <div class="tile"><div class="label">${escapeHtml(t("dates"))}</div><div class="value">${escapeHtml(fmtDate(trip.startDate))}
${escapeHtml(fmtDate(trip.endDate))}</div></div>
        <div class="tile"><div class="label">${escapeHtml(t("flightLegs"))}</div><div class="value">${escapeHtml(String(trip.flightLegs.length || 0))}</div></div>
        <div class="tile"><div class="label">${escapeHtml(t("hotelStays"))}</div><div class="value">${escapeHtml(String(trip.hotels.length || 0))}</div></div>
        <div class="tile"><div class="label">${escapeHtml(t("members"))}</div><div class="value">${escapeHtml(members.map(member=>dn(member)).join(", ") || "—")}</div></div>
        <div class="tile"><div class="label">${escapeHtml(t("generalNotes"))}</div><div class="value">${escapeHtml(trip.notes || "—")}</div></div>
        <div class="tile"><div class="label">${escapeHtml(t("optionalPlaces"))}</div><div class="value">${escapeHtml(String(trip.optionalStops.length || 0))}</div></div>
      </div>
    </section>

    <section class="section">
      <h2 class="section-title">${escapeHtml(t("flightLegs"))}</h2>
      ${trip.flightLegs.length ? trip.flightLegs.map((leg,index)=>`<div class="card">
        <div class="row">
          <div>
            <div class="label">${escapeHtml(t("flightDetails"))} ${index+1}</div>
            <div class="route">${escapeHtml([leg.airline, leg.flightNumber].filter(Boolean).join(" ") || `${t("flightDetails")} ${index+1}`)}</div>
            <p class="muted">${escapeHtml(`${leg.departureAirport || "—"} → ${leg.arrivalAirport || "—"}`)}</p>
          </div>
          <span class="pill">${escapeHtml(t("flightLegs"))}</span>
        </div>
        <div class="grid cols-2" style="margin-top:12px;">
          <div class="tile"><div class="label">${escapeHtml(t("departureTime"))}</div><div class="value">${escapeHtml(leg.departureTime ? fmtDate(leg.departureTime) : "—")}</div></div>
          <div class="tile"><div class="label">${escapeHtml(t("arrivalTime"))}</div><div class="value">${escapeHtml(leg.arrivalTime ? fmtDate(leg.arrivalTime) : "—")}</div></div>
          <div class="tile"><div class="label">${escapeHtml(t("terminal"))}</div><div class="value">${escapeHtml(leg.terminal || "—")}</div></div>
          <div class="tile"><div class="label">${escapeHtml(t("bookingReference"))}</div><div class="value">${escapeHtml(leg.bookingReference || "—")}</div></div>
        </div>
        ${leg.notes ? `<p style="margin-top:12px" class="muted">${escapeHtml(leg.notes)}</p>` : ""}
      </div>`).join("") : '<p class="muted">—</p>'}
    </section>

    <section class="section">
      <h2 class="section-title">${escapeHtml(t("hotelStays"))}</h2>
      ${trip.hotels.length ? trip.hotels.map((hotel,index)=>`<div class="card">
        <div class="row">
          <div>
            <div class="label">${escapeHtml(t("hotelDetails"))} ${index+1}</div>
            <div class="route">${escapeHtml(hotel.hotelName || `${t("hotelDetails")} ${index+1}`)}</div>
            <p class="muted">${escapeHtml(hotel.hotelAddress || "—")}</p>
          </div>
          <span class="pill" style="background:#dcfce7;color:#15803d;">${escapeHtml(t("hotelStays"))}</span>
        </div>
        <div class="grid cols-2" style="margin-top:12px;">
          <div class="tile"><div class="label">${escapeHtml(t("roomType"))}</div><div class="value">${escapeHtml(hotel.roomType || "—")}</div></div>
          <div class="tile"><div class="label">${escapeHtml(t("propertyContact"))}</div><div class="value">${escapeHtml(hotel.contact || "—")}</div></div>
          <div class="tile"><div class="label">${escapeHtml(t("checkIn"))}</div><div class="value">${escapeHtml(hotel.checkIn ? fmtDate(hotel.checkIn) : "—")}</div></div>
          <div class="tile"><div class="label">${escapeHtml(t("checkOut"))}</div><div class="value">${escapeHtml(hotel.checkOut ? fmtDate(hotel.checkOut) : "—")}</div></div>
          <div class="tile"><div class="label">${escapeHtml(t("confirmationCode"))}</div><div class="value">${escapeHtml(hotel.confirmationCode || "—")}</div></div>
        </div>
        ${hotel.notes ? `<p style="margin-top:12px" class="muted">${escapeHtml(hotel.notes)}</p>` : ""}
      </div>`).join("") : '<p class="muted">—</p>'}
    </section>

    <section class="section">
      <h2 class="section-title">${escapeHtml(t("itinerary"))}</h2>
      ${itineraryByDay.map(({day, items, optionalStops})=>`<div class="day">
        <h3>${escapeHtml(t("day"))} ${day}</h3>
        ${items.length ? items.map(item=>`<div class="card">
          <div class="row">
            <div>
              <div class="label">${escapeHtml(item.startTime)} - ${escapeHtml(item.endTime)}${(item.endDayOffset ?? 0) > 0 ? ` (+${item.endDayOffset}d)` : ""}</div>
              <div class="route">${escapeHtml(item.title)}</div>
              <p class="muted">${escapeHtml(item.stopLocation || "—")}</p>
            </div>
            <span class="pill">${escapeHtml(item.transport || "—")}</span>
          </div>
          ${item.details ? `<p style="margin-top:12px" class="muted">${escapeHtml(item.details)}</p>` : ""}
          ${(item.transitToNext?.duration || item.transitToNext?.details) ? `<div class="tile" style="margin-top:12px"><div class="label">${escapeHtml(t("transitTime"))}</div><div class="value">${escapeHtml(item.transitToNext?.duration || "—")}</div><p class="muted" style="margin-top:8px">${escapeHtml(item.transitToNext?.details || "")}</p></div>` : ""}
        </div>`).join("") : `<p class="muted">${escapeHtml(t("noItineraryDesc"))}</p>`}
        <div class="card">
          <div class="label">${escapeHtml(t("optionalPlaces"))}</div>
          ${optionalStops.length ? pdfList(optionalStops.map(stop=>`${stop.title} (${t(stop.type === "site" ? "sight" : stop.type === "restaurant" ? "restaurant" : "other")})${stop.location ? ` — ${stop.location}` : ""}${stop.notes ? ` • ${stop.notes}` : ""}${stop.url ? ` • ${stop.url}` : ""}`)) : `<p class="muted">${escapeHtml(t("noOptionalPlacesDesc"))}</p>`}
        </div>
      </div>`).join("")}
    </section>

    <section class="section">
      <h2 class="section-title">${escapeHtml(t("travelNotes"))}</h2>
      ${trip.travelNotes.length ? pdfList(trip.travelNotes.map(note=>`${note.authorName} — ${new Date(note.createdAt).toLocaleString()}${note.text ? ` • ${note.text}` : ""}`)) : `<p class="muted">${escapeHtml(t("noNotesDesc"))}</p>`}
    </section>

    <section class="section">
      <h2 class="section-title">${escapeHtml(t("expenses"))}</h2>
      <div class="grid cols-2">
        <div class="tile"><div class="label">${escapeHtml(t("totalSpent"))}</div><div class="value">${escapeHtml(fmtCur(expensesTotal, trip.expenses[0]?.currency || "USD"))}</div></div>
        <div class="tile"><div class="label">${escapeHtml(t("members"))}</div><div class="value">${escapeHtml(String(trip.members.length))}</div></div>
      </div>
      ${trip.expenses.length ? pdfList(trip.expenses.map(expense=>`${fmtDate(expense.date)} • ${expense.title} • ${fmtCur(expense.amount, expense.currency)} • ${expense.category}`)) : `<p class="muted" style="margin-top:12px">${escapeHtml(t("noExpensesDesc"))}</p>`}
    </section>

    <section class="section">
      <h2 class="section-title">${escapeHtml(t("luggage"))}</h2>
      ${trip.packingList.length ? pdfList(trip.packingList.map(item=>`${item.label} (${item.category})${item.packed ? " ✓" : ""}`)) : `<p class="muted">${escapeHtml(t("noLuggageDesc"))}</p>`}
    </section>
  </body>
</html>`;

  const printFrame = document.createElement("iframe");
  printFrame.setAttribute("aria-hidden", "true");
  printFrame.style.position = "fixed";
  printFrame.style.right = "0";
  printFrame.style.bottom = "0";
  printFrame.style.width = "0";
  printFrame.style.height = "0";
  printFrame.style.border = "0";

  const cleanup = () => {
    window.setTimeout(() => {
      printFrame.remove();
    }, 400);
  };

  printFrame.onload = () => {
    const frameWindow = printFrame.contentWindow;
    if(!frameWindow){
      cleanup();
      return;
    }

    const handleAfterPrint = () => {
      cleanup();
      frameWindow.removeEventListener("afterprint", handleAfterPrint);
    };

    frameWindow.addEventListener("afterprint", handleAfterPrint);
    window.setTimeout(() => {
      frameWindow.focus();
      frameWindow.print();
    }, 350);
  };

  document.body.appendChild(printFrame);
  printFrame.srcdoc = html;
}

function monthLabel(index:number){
  return new Date(2024, index, 1).toLocaleDateString("en-US", { month: "short" });
}

function getTripStatus(trip: Trip): "upcoming" | "active" | "past" {
  const now = new Date();
  const start = new Date(trip.startDate);
  const end = new Date(trip.endDate);
  if (start > now) return "upcoming";
  if (end < now) return "past";
  return "active";
}

function getStatusColor(status: ReturnType<typeof getTripStatus>): "green" | "blue" | "slate" {
  return status === "upcoming" ? "green" : status === "past" ? "slate" : "blue";
}

function formatForecastDate(date: string) {
  return new Date(date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

async function lookupLocation(siteCfg: SiteSettings, query: string): Promise<GeoPoint | null> {
  if (!query.trim()) return null;
  try {
    const gurl = buildUrl(siteCfg.weatherApi.geocodeUrl, { query });
    const r = await fetch(gurl);
    const d = await r.json();
    const loc = d.results?.[0];
    if (!loc) return null;
    return { name: loc.name ?? query, lat: loc.latitude, lon: loc.longitude };
  } catch {
    return null;
  }
}

async function fetchForecast(siteCfg: SiteSettings, point: GeoPoint): Promise<WeatherData | null> {
  try {
    const furl = buildUrl(siteCfg.weatherApi.forecastUrl, { lat: point.lat, lon: point.lon });
    const r = await fetch(furl);
    const d = await r.json();
    const cur = d.current ?? {};
    const daily = d.daily ?? {};
    return {
      current: {
        temp: cur.temperature_2m ?? 0,
        condition: weatherCodeMap[cur.weather_code ?? 0] ?? "Unknown",
        wind: cur.wind_speed_10m ?? 0,
        high: daily.temperature_2m_max?.[0] ?? 0,
        low: daily.temperature_2m_min?.[0] ?? 0,
      },
      forecast: (daily.time ?? []).slice(0, 7).map((dt: string, i: number) => ({
        date: dt,
        high: daily.temperature_2m_max?.[i] ?? 0,
        low: daily.temperature_2m_min?.[i] ?? 0,
        condition: weatherCodeMap[daily.weather_code?.[i] ?? 0] ?? "Unknown",
      })),
      monthlyClimate: undefined,
    };
  } catch {
    return null;
  }
}

async function fetchMonthlyClimateData(point: GeoPoint) {
  try {
    const now = new Date();
    const endYear = now.getFullYear() - 1;
    const startYear = endYear - 2;
    const startDate = `${startYear}-01-01`;
    const endDate = `${endYear}-12-31`;
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${point.lat}&longitude=${point.lon}&start_date=${startDate}&end_date=${endDate}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto`;
    const r = await fetch(url);
    const d = await r.json();
    const dates: string[] = d.daily?.time ?? [];
    const highs: number[] = d.daily?.temperature_2m_max ?? [];
    const lows: number[] = d.daily?.temperature_2m_min ?? [];
    const rain: number[] = d.daily?.precipitation_sum ?? [];
    if (!dates.length) return [];

    const grouped = Array.from({ length: 12 }, (_, index) => ({
      month: monthLabel(index),
      avgHigh: 0,
      avgLow: 0,
      avgRain: 0,
      count: 0,
    }));

    dates.forEach((date, index) => {
      const month = new Date(date).getMonth();
      grouped[month].avgHigh += highs[index] ?? 0;
      grouped[month].avgLow += lows[index] ?? 0;
      grouped[month].avgRain += rain[index] ?? 0;
      grouped[month].count += 1;
    });

    return grouped.map(({ month, avgHigh, avgLow, avgRain, count }) => ({
      month,
      avgHigh: count ? avgHigh / count : 0,
      avgLow: count ? avgLow / count : 0,
      avgRain: count ? avgRain / count : 0,
    }));
  } catch {
    return [];
  }
}

function readFile(file:File):Promise<string>{
  return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result as string);r.onerror=rej;r.readAsDataURL(file);});
}


function meetsPasswordPolicy(password:string){
  return password.length>=8;
}

function isPhoneValid(phone:string){
  return /^\d{8}$/.test(phone.trim());
}

function isFourDigitCode(v:string){
  return /^\d{4}$/.test(v.trim());
}

async function searchFlightByNumber(siteCfg:SiteSettings,flightNumber:string){
  const normalized=flightNumber.replace(/\s+/g,"").toUpperCase();
  if(!normalized)return null;
  try{
    const resp=await fetch(buildUrl(siteCfg.weatherApi.flightLookupUrl,{flightNumber:normalized}));
    if(!resp.ok)return null;
    const data=await resp.json();
    const route=data?.response?.flightroute;
    if(!route)return null;
    return {
      airline: route.airline?.name ?? "",
      departureAirport: route.origin?.iata_code ?? route.origin?.icao_code ?? "",
      arrivalAirport: route.destination?.iata_code ?? route.destination?.icao_code ?? "",
      departureTime: "",
      arrivalTime: "",
      terminal: "",
    };
  }catch{return null;}
}



function toDateInput(v:string){
  return v.includes("T") ? v.slice(0,10) : v;
}

function toTimeInput(v:string){
  if(!v.includes("T")) return "";
  return v.slice(11,16);
}

function combineDateTime(date:string,time:string){
  if(!date) return "";
  return time ? `${date}T${time}` : date;
}

function estimateDurationByDistanceKm(distanceKm:number,transport:string){
  const speeds:Record<string,number>={"Walk":5,"Bus":28,"Train":80,"Taxi":35,"Rental Car":45,"Flight":700,"Ferry":30,"Other":25};
  const speed=speeds[transport]??25;
  const hours=distanceKm/Math.max(1,speed);
  const mins=Math.max(10,Math.round(hours*60));
  if(mins>=60){
    const h=Math.floor(mins/60);
    const m=mins%60;
    return `${h}h${m?` ${m}m`:""}`;
  }
  return `${mins} min`;
}

function haversineKm(a:{lat:number;lon:number},b:{lat:number;lon:number}){
  const toRad=(v:number)=>v*Math.PI/180;
  const r=6371;
  const dLat=toRad(b.lat-a.lat);
  const dLon=toRad(b.lon-a.lon);
  const aa=Math.sin(dLat/2)**2+Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLon/2)**2;
  return r*2*Math.atan2(Math.sqrt(aa),Math.sqrt(1-aa));
}

function googleMapEmbedUrl(location:string){
  const q=encodeURIComponent(location.trim());
  if(!q)return "";
  return `https://www.google.com/maps?q=${q}&output=embed`;
}

function addFlightLegsToItinerary(base:ItineraryItem[], flightLegs:FlightLeg[], tripStartDate:string){
  const nonFlightItems=base.filter(item=>!(item.transport==="Flight"&&item.id.startsWith("flt-itin-")));
  const dayFromDateTime=(dateTime:string)=>{
    if(!tripStartDate||!dateTime) return 1;
    const dateOnly=toDateInput(dateTime);
    if(!dateOnly) return 1;
    const start=new Date(`${tripStartDate}T00:00:00`);
    const current=new Date(`${dateOnly}T00:00:00`);
    if(Number.isNaN(start.getTime())||Number.isNaN(current.getTime())) return 1;
    const diff=Math.floor((current.getTime()-start.getTime())/(1000*60*60*24));
    return Math.max(1,diff+1);
  };
  const generated=flightLegs.map((leg,index)=>{
    const dep=leg.departureAirport||"—";
    const arr=leg.arrivalAirport||"—";
    const flightLabel=[leg.airline,leg.flightNumber].filter(Boolean).join(" ")||`Flight ${index+1}`;
    const depTime=toTimeInput(leg.departureTime)||"";
    const arrTime=toTimeInput(leg.arrivalTime)||depTime;
    const depDate=toDateInput(leg.departureTime||"");
    const arrDate=toDateInput(leg.arrivalTime||"");
    const endDayOffset=depDate&&arrDate?Math.max(0,Math.floor((new Date(`${arrDate}T00:00:00`).getTime()-new Date(`${depDate}T00:00:00`).getTime())/(1000*60*60*24))):0;
    return {
      id:`flt-itin-${leg.id}`,
      day: dayFromDateTime(leg.departureTime || leg.arrivalTime),
      order: 0,
      startTime:depTime,
      endTime:arrTime,
      endDayOffset,
      title:flightLabel,
      stopLocation:`${dep} -> ${arr}`,
      transport:"Flight",
      details:[
        leg.departureTime?`Departure: ${fmtDate(leg.departureTime)}`:"",
        leg.arrivalTime?`Arrival: ${fmtDate(leg.arrivalTime)}`:"",
        leg.terminal?`Terminal: ${leg.terminal}`:"",
        leg.bookingReference?`Booking: ${leg.bookingReference}`:"",
      ].filter(Boolean).join(" • "),
      photo:"",
      mapUrl: googleMapEmbedUrl(`${dep} ${arr}`),
      transitToNext:{duration:"",details:""},
    } as ItineraryItem;
  });
  const combined=[...nonFlightItems,...generated];
  const byDay=new Map<number,ItineraryItem[]>();
  for(const item of combined){
    const key=item.day||1;
    const list=byDay.get(key)??[];
    list.push(item);
    byDay.set(key,list);
  }
  return [...combined].map(item=>{
    const sameDay=(byDay.get(item.day||1)??[]).slice().sort((a,b)=>a.startTime.localeCompare(b.startTime)||a.title.localeCompare(b.title));
    const idx=sameDay.findIndex(x=>x.id===item.id);
    return {...item,order:idx>=0?idx+1:item.order};
  });
}

async function searchHotelByQuery(siteCfg:SiteSettings,hotelName:string,location:string){
  const q=[hotelName,location].filter(Boolean).join(" ").trim();
  if(!q)return null;
  try{
    const url=buildUrl(siteCfg.weatherApi.hotelLookupUrl,{query:q});
    const resp=await fetch(url,{headers:{"Accept":"application/json"}});
    if(!resp.ok)return null;
    const data=await resp.json();
    const first=(Array.isArray(data)?data[0]:null) as {name?:string;display_name?:string}|null;
    if(!first)return null;
    return {
      hotelName: hotelName.trim() || first.name || q,
      hotelAddress: first.display_name || location,
      contact: "",
      roomType: "",
    };
  }catch{return null;}
}

/* ═══════════════════════════════════════════════════════════════════════════════
   UI PRIMITIVES
   ═══════════════════════════════════════════════════════════════════════════════ */
function Input(p:InputHTMLAttributes<HTMLInputElement>&{label?:string;th:ThemeMode}){
  const{label,th,className,...rest}=p;
  const f=<input {...rest} className={cx("w-full rounded-2xl border px-4 py-3 outline-none transition placeholder:opacity-50",
    th==="dark"?"border-white/10 bg-white/5 text-white focus:border-cyan-400/60":"border-slate-300 bg-white text-slate-900 focus:border-blue-500",className)}/>;
  if(!label)return f;
  return <label className="flex flex-col gap-2"><span className={th==="dark"?"text-slate-300":"text-slate-600"}>{label}</span>{f}</label>;
}

function Select(p:SelectHTMLAttributes<HTMLSelectElement>&{label?:string;th:ThemeMode;children:ReactNode}){
  const{label,th,className,children,...rest}=p;
  const f=<select {...rest} className={cx("w-full rounded-2xl border px-4 py-3 outline-none transition",
    th==="dark"?"border-white/10 bg-slate-900 text-white focus:border-cyan-400/60":"border-slate-300 bg-white text-slate-900 focus:border-blue-500",className)}>{children}</select>;
  if(!label)return f;
  return <label className="flex flex-col gap-2"><span className={th==="dark"?"text-slate-300":"text-slate-600"}>{label}</span>{f}</label>;
}

function Textarea(p:TextareaHTMLAttributes<HTMLTextAreaElement>&{label?:string;th:ThemeMode}){
  const{label,th,className,...rest}=p;
  const f=<textarea {...rest} className={cx("w-full rounded-2xl border px-4 py-3 outline-none transition placeholder:opacity-50 min-h-24 resize-none",
    th==="dark"?"border-white/10 bg-white/5 text-white focus:border-cyan-400/60":"border-slate-300 bg-white text-slate-900 focus:border-blue-500",className)}/>;
  if(!label)return f;
  return <label className="flex flex-col gap-2"><span className={th==="dark"?"text-slate-300":"text-slate-600"}>{label}</span>{f}</label>;
}

function Btn(p:ButtonHTMLAttributes<HTMLButtonElement>&{th:ThemeMode;v?:"pri"|"sec"|"ghost"|"danger";sz?:"sm"|"md"}){
  const{th,v="pri",sz="md",className,...rest}=p;
  return <button {...rest} className={cx("rounded-full font-medium transition disabled:opacity-40 whitespace-nowrap",
    sz==="sm"?"px-4 py-2 text-sm":"px-6 py-3",
    v==="pri"&&(th==="dark"?"bg-cyan-400 text-slate-950 hover:bg-cyan-300":"bg-slate-800 text-white hover:bg-slate-700"),
    v==="sec"&&(th==="dark"?"border border-white/15 bg-white/5 text-white hover:bg-white/10":"border border-slate-300 bg-white text-slate-800 hover:bg-slate-50"),
    v==="ghost"&&(th==="dark"?"text-slate-400 hover:text-white":"text-slate-500 hover:text-slate-900"),
    v==="danger"&&"bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20",className)}/>;
}

function Card({children,th,className,onClick}:{children:ReactNode;th:ThemeMode;className?:string;onClick?:()=>void}){
  return <div onClick={onClick} className={cx("rounded-3xl border transition-all",
    th==="dark"?"border-white/8 bg-white/[0.03]":"border-slate-200/80 bg-white/80 backdrop-blur",
    onClick&&"cursor-pointer hover:scale-[1.01]",className)}>{children}</div>;
}

function Badge({label,th,color="slate"}:{label:string;th:ThemeMode;color?:"blue"|"green"|"amber"|"rose"|"slate"}){
  const c={blue:"bg-blue-500/15 text-blue-400",green:"bg-emerald-500/15 text-emerald-400",amber:"bg-amber-500/15 text-amber-400",
    rose:"bg-rose-500/15 text-rose-400",slate:th==="dark"?"bg-white/8 text-slate-300":"bg-slate-100 text-slate-600"};
  return <span className={cx("rounded-full px-3 py-1 text-sm font-medium",c[color])}>{label}</span>;
}

function Tabs<T extends string>({tabs,active,onChange,th}:{tabs:{id:T;label:string;icon?:string}[];active:T;onChange:(id:T)=>void;th:ThemeMode}){
  return <div className={cx("flex gap-1 rounded-2xl p-1 overflow-x-auto",th==="dark"?"bg-white/5":"bg-slate-200/60")}>
    {tabs.map(t=><button key={t.id} onClick={()=>onChange(t.id)} className={cx(
      "flex items-center gap-2 rounded-xl px-5 py-2.5 font-medium whitespace-nowrap transition-all",
      active===t.id?(th==="dark"?"bg-white/10 text-white shadow-sm":"bg-white text-slate-900 shadow-sm")
        :(th==="dark"?"text-slate-400 hover:text-slate-200":"text-slate-500 hover:text-slate-800")
    )}>{t.icon&&<span className="text-lg">{t.icon}</span>}{t.label}</button>)}
  </div>;
}

function Modal({open,onClose,th,children,title}:{open:boolean;onClose:()=>void;th:ThemeMode;children:ReactNode;title?:string}){
  if(!open)return null;
  return <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"/>
    <motion.div initial={{opacity:0,scale:.96}} animate={{opacity:1,scale:1}} exit={{opacity:0,scale:.96}}
      className={cx("relative z-10 w-full max-w-lg rounded-3xl border p-8 shadow-2xl max-h-[90vh] overflow-y-auto",
        th==="dark"?"border-white/10 bg-slate-900":"border-slate-200 bg-white")}
      onClick={e=>e.stopPropagation()}>
      {title&&<div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold">{title}</h2>
        <button onClick={onClose} className="opacity-60 hover:opacity-100 text-2xl">✕</button>
      </div>}
      {children}
    </motion.div>
  </div>;
}

function Empty({icon,title,desc,th}:{icon:string;title:string;desc:string;th:ThemeMode}){
  return <div className="flex flex-col items-center justify-center py-20 text-center">
    <span className="text-6xl mb-5">{icon}</span>
    <p className="font-semibold text-xl mb-2">{title}</p>
    <p className={cx("max-w-xs",th==="dark"?"text-slate-400":"text-slate-500")}>{desc}</p>
  </div>;
}

function Avatar({name,th}:{name:string;th:ThemeMode}){
  const ini=name.split(" ").map(w=>w[0]?.toUpperCase()||"").slice(0,2).join("");
  return <div className={cx("w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg",
    th==="dark"?"bg-cyan-400/20 text-cyan-300":"bg-blue-100 text-blue-700")}>{ini}</div>;
}

/* ═══════════════════════════════════════════════════════════════════════════════
   LANDING PAGE
   ═══════════════════════════════════════════════════════════════════════════════ */
function Landing({siteName,desc,t,onIn,onUp}:{th:ThemeMode;siteName:string;desc:string;t:(k:TKey)=>string;onIn:()=>void;onUp:()=>void}){
  const [idx,setIdx]=useState(0);
  useEffect(()=>{const iv=setInterval(()=>setIdx(i=>(i+1)%HERO_IMAGES.length),5000);return ()=>clearInterval(iv);},[]);
  return <div className="min-h-screen relative overflow-hidden">
    {HERO_IMAGES.map((img,i)=><div key={img} className="hero-bg" style={{backgroundImage:`url(${img})`,opacity:i===idx?1:0}}/>)}
    <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/30 to-black/60"/>
    <div className="relative z-10 flex flex-col items-center justify-center min-h-screen text-white px-6 text-center">
      <h1 className="text-6xl font-black mb-4 drop-shadow-lg">{siteName}</h1>
      <p className="text-2xl mb-10 max-w-2xl drop-shadow">{desc}</p>
      <div className="flex gap-4">
        <Btn th="dark" onClick={onUp} className="!px-8 !py-4 !text-lg">{t("getStarted")}</Btn>
        <Btn th="dark" v="sec" onClick={onIn} className="!px-8 !py-4 !text-lg">{t("signIn")}</Btn>
      </div>
    </div>
  </div>;
}

/* ═══════════════════════════════════════════════════════════════════════════════
   HEADER
   ═══════════════════════════════════════════════════════════════════════════════ */
function Header({siteName,th,setTh,lang,setLang,user,view,setView,t,onLogout,onSignIn,onSync,isSyncing}:{
  siteName:string;th:ThemeMode;setTh:(v:ThemeMode)=>void;lang:Language;setLang:(v:Language)=>void;
  user?:Profile;view:ViewMode;setView:(v:ViewMode)=>void;t:(k:TKey)=>string;onLogout:()=>void;onSignIn:()=>void;
  onSync:()=>void;isSyncing:boolean;
}){
  return <header className={cx("sticky top-0 z-40 border-b backdrop-blur-lg transition-colors",
    th==="dark"?"border-white/10 bg-slate-950/80":"border-slate-200 bg-white/80")}>
    <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
      <h1 className="text-2xl font-bold cursor-pointer" onClick={()=>setView("user")}>✈ {siteName}</h1>
      <div className="flex items-center gap-3">
        <select value={lang} onChange={e=>setLang(e.target.value as Language)}
          className={cx("rounded-full px-3 py-1.5 text-sm border outline-none transition",
            th==="dark"?"border-white/10 bg-white/5 text-white":"border-slate-300 bg-white text-slate-900")}>
          <option value="en">EN</option><option value="zh">中文</option>
        </select>
        <button onClick={()=>setTh(th==="dark"?"light":"dark")}
          className={cx("w-10 h-10 rounded-full flex items-center justify-center text-xl transition",
            th==="dark"?"bg-white/5 hover:bg-white/10":"bg-slate-100 hover:bg-slate-200")}>
          {th==="dark"?"☀️":"🌙"}
        </button>
        <Btn th={th} v="ghost" sz="sm" onClick={onSync} disabled={isSyncing}>
          {isSyncing ? "Syncing…" : "Sync now"}
        </Btn>
        {view==="user"&&<Btn th={th} v="ghost" sz="sm" onClick={()=>setView("admin")}>{t("admin")}</Btn>}
        {view==="admin"&&user&&<Btn th={th} v="ghost" sz="sm" onClick={()=>setView("user")}>{t("myTrips")}</Btn>}
        {user?<>
          <div className="flex items-center gap-2 pl-3 border-l"
            style={{borderColor:th==="dark"?"rgba(255,255,255,0.1)":"rgba(0,0,0,0.1)"}}>
            <Avatar name={dn(user)} th={th}/>
            <span className="font-medium hidden sm:inline">{dn(user)}</span>
          </div>
          <Btn th={th} v="sec" sz="sm" onClick={onLogout}>{t("signOut")}</Btn>
        </>:<Btn th={th} sz="sm" onClick={onSignIn}>{t("signIn")}</Btn>}
      </div>
    </div>
  </header>;
}

/* ═══════════════════════════════════════════════════════════════════════════════
   AUTH MODAL
   ═══════════════════════════════════════════════════════════════════════════════ */
function AuthModal({open,mode,th,t,onClose,onSignIn,onSignUp,onToggle}:{
  open:boolean;mode:"signin"|"signup";th:ThemeMode;t:(k:TKey)=>string;onClose:()=>void;
  onSignIn:(i:string,p:string)=>{ok:boolean;message:string};
  onSignUp:(d:Omit<Profile,"id">)=>{ok:boolean;message:string};onToggle:()=>void;
}){
  const [form,setForm]=useState({accountName:"",accountDigits:"",firstName:"",lastName:"",email:"",phone:"",password:"",password2:"",
    dateOfBirth:"",nationality:"",passportNumber:"",passportExpiryDate:"",dietaryNotes:"",emergencyContact:"",homeAirport:"HKG"});
  const [ident,setIdent]=useState("");
  const [pw,setPw]=useState("");
  const [err,setErr]=useState("");

  const handleSignIn=(e:React.FormEvent)=>{
    e.preventDefault();
    const res=onSignIn(ident,pw);
    if(!res.ok){setErr(res.message);}else{onClose();}
  };

  const handleSignUp=(e:React.FormEvent)=>{
    e.preventDefault();setErr("");
    if(!form.accountName.trim()||!form.firstName.trim()||!form.lastName.trim()||!form.email.trim()||!form.phone.trim()||!form.password.trim()){
      setErr("Please fill in all required fields.");return;
    }
    if(!isFourDigitCode(form.accountDigits)){setErr(t("accountDigitsRule"));return;}
    if(!isPhoneValid(form.phone)){setErr(t("phoneRule"));return;}
    if(form.password!==form.password2){setErr(t("passwordMismatch"));return;}
    if(!meetsPasswordPolicy(form.password)){setErr(t("passwordPolicy"));return;}
    const res=onSignUp({
      accountName:`${upper(form.accountName)}${form.accountDigits.trim()}`,
      firstName:normalizeName(form.firstName),lastName:normalizeName(form.lastName),
      email:form.email.trim(),phone:form.phone.trim(),password:form.password,
      dateOfBirth:form.dateOfBirth,
      nationality:form.nationality.trim(),passportNumber:form.passportNumber.trim(),passportExpiryDate:form.passportExpiryDate,
      dietaryNotes:form.dietaryNotes.trim(),emergencyContact:form.emergencyContact.trim(),homeAirport:normalizeAirport(form.homeAirport)||"HKG"
    });
    if(!res.ok){setErr(res.message);}else{onClose();}
  };

  return <Modal open={open} onClose={onClose} th={th} title={mode==="signin"?t("signIn"):t("signUp")}>
    {mode==="signin"?<form onSubmit={handleSignIn} className="space-y-4">
      <p className={cx("text-sm",th==="dark"?"text-slate-400":"text-slate-500")}>{t("signInDesc")}</p>
      <Input th={th} label={t("accountOrEmail")} placeholder={t("accountOrEmailHint")} value={ident} onChange={e=>setIdent(e.target.value)}/>
      <Input th={th} label={t("password")} type="password" value={pw} onChange={e=>setPw(e.target.value)}/>
      {err&&<p className="text-rose-400 text-sm">{err}</p>}
      <div className="flex gap-3">
        <Btn th={th} type="submit" className="flex-1">{t("signIn")}</Btn>
        <Btn th={th} v="sec" type="button" onClick={onToggle}>{t("signUp")}</Btn>
      </div>
    </form>:<form onSubmit={handleSignUp} className="space-y-4">
      <div className={cx("rounded-2xl border p-3.5",th==="dark"?"border-cyan-400/30 bg-cyan-500/10":"border-blue-200 bg-blue-50")}>
        <p className={cx("text-sm font-semibold mb-2",th==="dark"?"text-cyan-200":"text-blue-700")}>{t("signupInstructions")}</p>
        <ul className={cx("text-sm list-disc pl-5 space-y-1",th==="dark"?"text-slate-300":"text-slate-700")}>
          <li>{t("signupRuleName")}</li>
          <li>{t("signupRuleAccount")}</li>
          <li>{t("signupRulePhone")}</li>
          <li>{t("signupRulePassword")}</li>
          <li>{t("signupRuleAirport")}</li>
        </ul>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input th={th} label={`${t("accountName")} *`} placeholder={t("accountNameHint")} value={form.accountName} onChange={e=>setForm(f=>({...f,accountName:upper(e.target.value)}))}/>
        <Input th={th} label={t("accountDigits")} placeholder={t("accountDigitsHint")} maxLength={4} value={form.accountDigits} onChange={e=>setForm(f=>({...f,accountDigits:e.target.value.replace(/\D/g,"").slice(0,4)}))}/>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input th={th} label={`${t("firstName")} *`} placeholder={t("nameHint")} value={form.firstName} onChange={e=>setForm(f=>({...f,firstName:upper(e.target.value)}))}/>
        <Input th={th} label={`${t("lastName")} *`} placeholder={t("nameHint")} value={form.lastName} onChange={e=>setForm(f=>({...f,lastName:upper(e.target.value)}))}/>
      </div>
      <Input th={th} label={`${t("email")} *`} type="email" placeholder="name@example.com" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))}/>
      <Input th={th} label={`${t("phone")} *`} placeholder={t("phoneHint")} maxLength={8} value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value.replace(/\D/g,"").slice(0,8)}))}/>
      <Input th={th} label={`${t("password")} *`} type="password" placeholder={t("passwordHint")} value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value}))}/>
      <Input th={th} label={`${t("confirmPassword")} *`} type="password" placeholder={t("passwordHint")} value={form.password2} onChange={e=>setForm(f=>({...f,password2:e.target.value}))}/>
      <details className={cx("text-sm",th==="dark"?"text-slate-400":"text-slate-500")}>
        <summary className="cursor-pointer font-medium mb-2">{t("optional")}</summary>
        <div className="space-y-3 mt-3">
          <Input th={th} label={t("nationality")} value={form.nationality} onChange={e=>setForm(f=>({...f,nationality:e.target.value}))}/>
          <Input th={th} label={t("passport")} value={form.passportNumber} onChange={e=>setForm(f=>({...f,passportNumber:e.target.value}))}/>
          <Input th={th} label={t("dateOfBirth")} type="date" value={form.dateOfBirth} onChange={e=>setForm(f=>({...f,dateOfBirth:e.target.value}))}/>
          <Input th={th} label={t("passportExpiry")} type="date" value={form.passportExpiryDate} onChange={e=>setForm(f=>({...f,passportExpiryDate:e.target.value}))}/>
          <Input th={th} label={t("emergencyContact")} value={form.emergencyContact} onChange={e=>setForm(f=>({...f,emergencyContact:e.target.value}))}/>
          <Input th={th} label={t("homeAirport")} placeholder={t("homeAirportHint")} maxLength={3} value={form.homeAirport} onChange={e=>setForm(f=>({...f,homeAirport:upper(e.target.value).slice(0,3)}))}/>
          <Textarea th={th} label={t("dietaryNotes")} value={form.dietaryNotes} onChange={e=>setForm(f=>({...f,dietaryNotes:e.target.value}))}/>
        </div>
      </details>
      {err&&<p className="text-rose-400 text-sm">{err}</p>}
      <div className="flex gap-3">
        <Btn th={th} type="submit" className="flex-1">{t("signUp")}</Btn>
        <Btn th={th} v="sec" type="button" onClick={onToggle}>{t("signIn")}</Btn>
      </div>
    </form>}
  </Modal>;
}

/* ═══════════════════════════════════════════════════════════════════════════════
   USER WORKSPACE
   ═══════════════════════════════════════════════════════════════════════════════ */
function UserWorkspace({user,trips,profiles,siteCfg,th,t,onUpdate,onCreate,onJoin,onTripUpdate,onAddExp,onAddPack,onTogglePack,onRemovePack,onUpdateItin,onRemoveExp}:{
  user:Profile;trips:Trip[];profiles:Profile[];siteCfg:SiteSettings;th:ThemeMode;t:(k:TKey)=>string;
  onUpdate:(d:Partial<Profile>)=>void;onCreate:(d:{title:string;location:string;startDate:string;endDate:string})=>void;
  onJoin:(code:string)=>{ok:boolean;message:string};onTripUpdate:(id:string,d:Partial<Trip>)=>void;
  onAddExp:(tid:string,e:Omit<Expense,"id">)=>void;onAddPack:(tid:string,l:string,cat:string)=>void;
  onTogglePack:(tid:string,iid:string)=>void;onRemovePack:(tid:string,iid:string)=>void;
  onUpdateItin:(tid:string,items:ItineraryItem[])=>void;onRemoveExp:(tid:string,eid:string)=>void;
}){
  const [section,setSection]=useState<UserSection>("trips");
  const [activeTrip,setActiveTrip]=useState<string|null>(null);

  const myTrips=useMemo(()=>trips.filter(t=>t.members.includes(user.id)).sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime()),[trips,user.id]);
  const trip=activeTrip?myTrips.find(t=>t.id===activeTrip):null;

  return <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
    <Tabs tabs={[{id:"dashboard" as const,label:t("dashboard"),icon:"📊"},{id:"trips" as const,label:t("myTrips"),icon:"✈️"}]}
      active={section} onChange={setSection} th={th}/>

    {section==="dashboard"&&<Dashboard user={user} trips={myTrips} th={th} t={t} onUpdate={onUpdate} onSelectTrip={id=>{setActiveTrip(id);setSection("trips");}}/>}

    {section==="trips"&&<>
      {!trip?<TripSelector trips={myTrips} th={th} t={t} onCreate={onCreate} onJoin={onJoin} onSelect={setActiveTrip}/>
      :<TripDetail trip={trip} user={user} profiles={profiles} siteCfg={siteCfg} th={th} t={t} onBack={()=>setActiveTrip(null)}
        onUpdate={onTripUpdate} onAddExp={onAddExp} onAddPack={onAddPack} onTogglePack={onTogglePack} onRemovePack={onRemovePack}
        onUpdateItin={onUpdateItin} onRemoveExp={onRemoveExp}/>}
    </>}
  </div>;
}

function Dashboard({user,trips,th,t,onUpdate,onSelectTrip}:{user:Profile;trips:Trip[];th:ThemeMode;t:(k:TKey)=>string;onUpdate:(d:Partial<Profile>)=>void;onSelectTrip:(id:string)=>void}){
  const [editMode,setEditMode]=useState(false);
  const [form,setForm]=useState({...user});

  const now=new Date();
  const upcoming=trips.filter(tr=>new Date(tr.startDate)>now).length;
  const past=trips.filter(tr=>new Date(tr.endDate)<now).length;

  const save=()=>{onUpdate(form);setEditMode(false);};

  return <div className="grid lg:grid-cols-2 gap-6">
    <Card th={th} className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">{t("personalInfo")}</h2>
        {!editMode?<Btn th={th} v="sec" sz="sm" onClick={()=>setEditMode(true)}>{t("editProfile")}</Btn>
        :<Btn th={th} sz="sm" onClick={save}>{t("saveProfile")}</Btn>}
      </div>
      {!editMode?<div className="space-y-4">
        <div className="flex items-center gap-4">
          <Avatar name={dn(user)} th={th}/>
          <div>
            <p className="font-bold text-xl">{dn(user)}</p>
            <p className={cx("text-sm",th==="dark"?"text-slate-400":"text-slate-500")}>@{user.accountName}</p>
          </div>
        </div>
        <div className="grid gap-3">
          <InfoRow label={t("accountName")} value={`@${user.accountName}`} th={th}/>
          <InfoRow label={t("firstName")} value={user.firstName || "—"} th={th}/>
          <InfoRow label={t("lastName")} value={user.lastName || "—"} th={th}/>
          <InfoRow label={t("email")} value={user.email || "—"} th={th}/>
          <InfoRow label={t("phone")} value={user.phone || "—"} th={th}/>
          <InfoRow label={t("dateOfBirth")} value={user.dateOfBirth ? fmtDate(user.dateOfBirth) : "—"} th={th}/>
          <InfoRow label={t("nationality")} value={user.nationality || "—"} th={th}/>
          <InfoRow label={t("passport")} value={user.passportNumber || "—"} th={th}/>
          <InfoRow label={t("passportExpiry")} value={user.passportExpiryDate ? fmtDate(user.passportExpiryDate) : "—"} th={th}/>
          <InfoRow label={t("homeAirport")} value={user.homeAirport || "—"} th={th}/>
          <InfoRow label={t("emergencyContact")} value={user.emergencyContact || "—"} th={th}/>
          <InfoRow label={t("dietaryNotes")} value={user.dietaryNotes || "—"} th={th}/>
        </div>
      </div>:<div className="space-y-3">
        <Input th={th} label={t("accountName")} placeholder={t("accountNameHint")} value={form.accountName} onChange={e=>setForm(f=>({...f,accountName:upper(e.target.value)}))}/>
        <div className="grid grid-cols-2 gap-3">
          <Input th={th} label={t("firstName")} placeholder={t("nameHint")} value={form.firstName} onChange={e=>setForm(f=>({...f,firstName:upper(e.target.value)}))}/>
          <Input th={th} label={t("lastName")} placeholder={t("nameHint")} value={form.lastName} onChange={e=>setForm(f=>({...f,lastName:upper(e.target.value)}))}/>
        </div>
        <Input th={th} label={t("email")} value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))}/>
        <Input th={th} label={t("phone")} placeholder={t("phoneHint")} maxLength={8} value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value.replace(/\D/g,"").slice(0,8)}))}/>
        <Input th={th} label={t("nationality")} value={form.nationality||""} onChange={e=>setForm(f=>({...f,nationality:e.target.value}))}/>
        <Input th={th} label={t("passport")} value={form.passportNumber||""} onChange={e=>setForm(f=>({...f,passportNumber:e.target.value}))}/>
        <Input th={th} label={t("dateOfBirth")} type="date" value={form.dateOfBirth||""} onChange={e=>setForm(f=>({...f,dateOfBirth:e.target.value}))}/>
        <Input th={th} label={t("passportExpiry")} type="date" value={form.passportExpiryDate||""} onChange={e=>setForm(f=>({...f,passportExpiryDate:e.target.value}))}/>
        <Input th={th} label={t("homeAirport")} placeholder={t("homeAirportHint")} maxLength={3} value={form.homeAirport||""} onChange={e=>setForm(f=>({...f,homeAirport:upper(e.target.value).slice(0,3)}))}/>
        <Input th={th} label={t("emergencyContact")} value={form.emergencyContact||""} onChange={e=>setForm(f=>({...f,emergencyContact:e.target.value}))}/>
        <Textarea th={th} label={t("dietaryNotes")} value={form.dietaryNotes||""} onChange={e=>setForm(f=>({...f,dietaryNotes:e.target.value}))}/>
      </div>}
    </Card>

    <div className="space-y-7">
      <Card th={th} className="p-8">
        <h3 className="text-2xl font-bold mb-6">{t("tripSummary")}</h3>
        <div className="grid grid-cols-3 gap-4">
          <StatCard th={th} label={t("totalTrips")} value={trips.length} color="blue"/>
          <StatCard th={th} label={t("upcomingTrips")} value={upcoming} color="green"/>
          <StatCard th={th} label={t("pastTrips")} value={past} color="slate"/>
        </div>
      </Card>

      <div className="grid gap-4">
        {trips.slice(0,4).map(tr=><Card key={tr.id} th={th} className="p-5 cursor-pointer hover:scale-[1.02] transition-transform" onClick={()=>onSelectTrip(tr.id)}>
          <div className="flex gap-4">
            {tr.bannerImage&&<img src={tr.bannerImage} alt="" className="w-20 h-20 rounded-xl object-cover"/>}
            <div className="flex-1">
              <p className="font-bold text-lg">{tr.title}</p>
              <p className={cx("text-sm",th==="dark"?"text-slate-400":"text-slate-500")}>{tr.location} · {fmtDate(tr.startDate)}</p>
            </div>
          </div>
        </Card>)}
      </div>
    </div>
  </div>;
}

function InfoRow({label,value,th}:{label:string;value:string;th:ThemeMode}){
  return <div className={cx("rounded-2xl border p-3.5",th==="dark"?"border-white/10 bg-white/[0.04]":"border-slate-200 bg-white")}>
    <p className={cx("text-xs font-semibold uppercase tracking-[0.16em]",th==="dark"?"text-slate-400":"text-slate-500")}>{label}</p>
    <p className={cx("mt-2 text-sm font-semibold leading-6 break-words whitespace-pre-wrap",th==="dark"?"text-slate-100":"text-slate-900")}>{value}</p>
  </div>;
}

function DetailHeader({title,subtitle,badge,th}:{title:string;subtitle:string;badge:string;th:ThemeMode}){
  return <div className="flex flex-wrap items-start justify-between gap-4">
    <div className="min-w-0">
      <p className="text-2xl font-bold break-words">{title}</p>
      <p className={cx("mt-2 text-sm leading-6 break-words",th==="dark"?"text-slate-300":"text-slate-600")}>{subtitle}</p>
    </div>
    <Badge label={badge} th={th}/>
  </div>;
}

function StatCard({th,label,value,color}:{th:ThemeMode;label:string;value:number;color:"blue"|"green"|"slate"}){
  const c={blue:"bg-blue-500/10 text-blue-400",green:"bg-emerald-500/10 text-emerald-400",slate:th==="dark"?"bg-white/5 text-slate-300":"bg-slate-100 text-slate-600"};
  return <div className={cx("rounded-2xl p-4 text-center",c[color])}>
    <p className="text-3xl font-bold">{value}</p>
    <p className="text-sm opacity-75 mt-1">{label}</p>
  </div>;
}

function TripSelector({trips,th,t,onCreate,onJoin,onSelect}:{trips:Trip[];th:ThemeMode;t:(k:TKey)=>string;onCreate:(d:{title:string;location:string;startDate:string;endDate:string})=>void;onJoin:(code:string)=>{ok:boolean;message:string};onSelect:(id:string)=>void}){
  const [showCreate,setShowCreate]=useState(false);
  const [showJoin,setShowJoin]=useState(false);
  const [form,setForm]=useState({title:"",location:"",startDate:"",endDate:""});
  const [joinCode,setJoinCode]=useState("");
  const [msg,setMsg]=useState("");

  const handleCreate=(e:React.FormEvent)=>{
    e.preventDefault();
    if(!form.title.trim()||!form.location.trim()||!form.startDate||!form.endDate)return;
    onCreate(form);
    setForm({title:"",location:"",startDate:"",endDate:""});
    setShowCreate(false);
  };

  const handleJoin=(e:React.FormEvent)=>{
    e.preventDefault();setMsg("");
    const res=onJoin(joinCode.trim().toUpperCase());
    if(res.ok){setShowJoin(false);setJoinCode("");}else setMsg(res.message);
  };

  return <div className="space-y-6">
    <div className="flex gap-3">
      <Btn th={th} onClick={()=>setShowCreate(true)}>+ {t("createTrip")}</Btn>
      <Btn th={th} v="sec" onClick={()=>setShowJoin(true)}>{t("joinTrip")}</Btn>
    </div>

    {trips.length===0?<Empty icon="✈️" title={t("noTrips")} desc={t("noTripsDesc")} th={th}/>
    :<div className="grid md:grid-cols-2 gap-4">
      {trips.map(tr=><TripCard key={tr.id} trip={tr} th={th} t={t} onClick={()=>onSelect(tr.id)}/>)}
    </div>}

    <Modal open={showCreate} onClose={()=>setShowCreate(false)} th={th} title={t("createTrip")}>
      <form onSubmit={handleCreate} className="space-y-4">
        <Input th={th} label={t("tripName")} value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))}/>
        <Input th={th} label={t("destination")} value={form.location} onChange={e=>setForm(f=>({...f,location:e.target.value}))}/>
        <div className="grid grid-cols-2 gap-3">
          <Input th={th} label={t("startDate")} type="date" value={form.startDate} onChange={e=>setForm(f=>({...f,startDate:e.target.value}))}/>
          <Input th={th} label={t("endDate")} type="date" value={form.endDate} onChange={e=>setForm(f=>({...f,endDate:e.target.value}))}/>
        </div>
        <Btn th={th} type="submit">{t("createTrip")}</Btn>
      </form>
    </Modal>

    <Modal open={showJoin} onClose={()=>setShowJoin(false)} th={th} title={t("joinTrip")}>
      <form onSubmit={handleJoin} className="space-y-4">
        <Input th={th} label={t("tripId")} value={joinCode} onChange={e=>setJoinCode(e.target.value)} placeholder={t("enterTripId")}/>
        {msg&&<p className="text-rose-400 text-sm">{msg}</p>}
        <Btn th={th} type="submit">{t("joinTrip")}</Btn>
      </form>
    </Modal>
  </div>;
}

function TripCard({trip,th,t,onClick}:{trip:Trip;th:ThemeMode;t:(k:TKey)=>string;onClick:()=>void}){
  const status=getTripStatus(trip);

  return <Card th={th} onClick={onClick} className="overflow-hidden">
    <div className="h-40 bg-gradient-to-br from-blue-500 to-purple-600 relative" style={{background:trip.bannerImage?`url(${trip.bannerImage}) center/cover`:trip.bannerColor}}>
      <div className="absolute top-3 right-3">
        <Badge label={t(status)} th={th} color={getStatusColor(status)}/>
      </div>
    </div>
    <div className="p-5 space-y-2">
      <h3 className="font-bold text-xl">{trip.title}</h3>
      <p className={cx("text-sm",th==="dark"?"text-slate-400":"text-slate-500")}>
        📍 {trip.location} · {fmtDate(trip.startDate)} – {fmtDate(trip.endDate)}
      </p>
      <p className={cx("text-sm font-semibold",status==="upcoming"?"text-emerald-400":status==="past"?(th==="dark"?"text-slate-400":"text-slate-600"):"text-cyan-400")}>{t("status")}: {t(status)}</p>
      <p className={cx("text-sm",th==="dark"?"text-slate-400":"text-slate-500")}>
        👥 {trip.members.length} {t("members")} · {trip.duration} {t("days")}
      </p>
    </div>
  </Card>;
}

function TripDetail({trip,user,profiles,siteCfg,th,t,onBack,onUpdate,onAddExp,onAddPack,onTogglePack,onRemovePack,onUpdateItin,onRemoveExp}:{
  trip:Trip;user:Profile;profiles:Profile[];siteCfg:SiteSettings;th:ThemeMode;t:(k:TKey)=>string;onBack:()=>void;
  onUpdate:(id:string,d:Partial<Trip>)=>void;onAddExp:(tid:string,e:Omit<Expense,"id">)=>void;
  onAddPack:(tid:string,l:string,cat:string)=>void;onTogglePack:(tid:string,iid:string)=>void;
  onRemovePack:(tid:string,iid:string)=>void;onUpdateItin:(tid:string,items:ItineraryItem[])=>void;
  onRemoveExp:(tid:string,eid:string)=>void;
}){
  const [tab,setTab]=useState<TripTab>("overview");
  const isOwner=trip.ownerId===user.id;
  const status=getTripStatus(trip);

  const tripTabs:{id:TripTab;label:string;icon:string}[]=[
    {id:"overview",label:t("overview"),icon:"📋"},{id:"travelers",label:t("travelers"),icon:"👥"},{id:"itinerary",label:t("itinerary"),icon:"🗓️"},
    {id:"expenses",label:t("expenses"),icon:"💰"},{id:"luggage",label:t("luggage"),icon:"🧳"},
    {id:"settings",label:t("settings"),icon:"⚙️"},
  ];

  return <div className="space-y-6">
    <div className="flex items-center gap-4">
      <Btn th={th} v="ghost" sz="sm" onClick={onBack}>← {t("back")}</Btn>
    </div>

    {/* TRIP HEADER */}
    <div className="relative rounded-3xl overflow-hidden" style={{minHeight:"280px"}}>
      <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-purple-600" style={{background:trip.bannerImage?`url(${trip.bannerImage}) center/cover`:trip.bannerColor}}/>
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent"/>
      <div className="relative z-10 p-10 text-white">
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <Badge label={`${t("status")}: ${t(status)}`} th={th} color={getStatusColor(status)}/>
          <button onClick={()=>{copyText(trip.id);}} className="flex items-center gap-2 rounded-full bg-white/20 px-4 py-2 transition hover:bg-white/30">
            📋 {trip.id} <span className="text-sm opacity-75">({t("copyId")})</span>
          </button>
        </div>
        <h1 className="text-5xl font-black mb-3">{trip.title}</h1>
        <p className="text-2xl mb-6">📍 {trip.location}</p>
        <div className="flex flex-wrap gap-4 text-lg">
          <span>📅 {fmtDate(trip.startDate)} – {fmtDate(trip.endDate)}</span>
          <span>⏱️ {trip.duration} {t("days")}</span>
          <span>👥 {trip.members.length} {t("members")}</span>
          <span>🧭 {t(status)}</span>
        </div>
      </div>
    </div>

    <Tabs tabs={tripTabs} active={tab} onChange={setTab} th={th}/>

    {tab==="overview"&&<TripOverview trip={trip} user={user} profiles={profiles} siteCfg={siteCfg} th={th} t={t} onUpdate={onUpdate}/>} 
    {tab==="travelers"&&<TripTravelers trip={trip} profiles={profiles} th={th} t={t}/>} 
    {tab==="itinerary"&&<TripItinerary trip={trip} th={th} t={t} onUpdate={onUpdateItin} onTripUpdate={onUpdate}/>}
    {tab==="expenses"&&<TripExpenses trip={trip} user={user} profiles={profiles} th={th} t={t} onAdd={onAddExp} onRemove={onRemoveExp}/>}
    {tab==="luggage"&&<TripLuggage trip={trip} siteCfg={siteCfg} th={th} t={t} onAdd={onAddPack} onToggle={onTogglePack} onRemove={onRemovePack}/>}
    {tab==="settings"&&<TripSettings trip={trip} isOwner={isOwner} siteCfg={siteCfg} th={th} t={t} onUpdate={onUpdate}/>}
  </div>;
}

function TripOverview({trip,user,profiles,siteCfg,th,t,onUpdate}:{trip:Trip;user:Profile;profiles:Profile[];siteCfg:SiteSettings;th:ThemeMode;t:(k:TKey)=>string;onUpdate:(id:string,d:Partial<Trip>)=>void}){
  const [weather,setWeather]=useState<WeatherData|null>(null);
  const [loading,setLoading]=useState(false);
  const [showCustomLoc,setShowCustomLoc]=useState(false);
  const [customForm,setCustomForm]=useState({name:trip.customLocation?.name||trip.location,lat:trip.customLocation?.lat||0,lon:trip.customLocation?.lon||0});
  const [noteText,setNoteText]=useState("");
  const [noteFiles,setNoteFiles]=useState<{url:string;name:string}[]>([]);
  const [urlInput,setUrlInput]=useState("");

  const memberProfiles=trip.members.map(id=>profiles.find(profile=>profile.id===id)).filter(Boolean) as Profile[];
  const flightLegs=trip.flightLegs.length>0?trip.flightLegs:[{
    id:"legacy-flight",airline:trip.airline,flightNumber:trip.flightNumber,departureAirport:trip.departureAirport,arrivalAirport:trip.arrivalAirport,
    departureTime:trip.departureTime,arrivalTime:trip.arrivalTime,terminal:trip.terminal,bookingReference:trip.bookingReference,notes:"",
  }].filter(leg=>Object.values(leg).some(Boolean));
  const hotels=trip.hotels.length>0?trip.hotels:[{
    id:"legacy-hotel",hotelName:trip.hotelName,hotelAddress:trip.hotelAddress,roomType:trip.roomType,checkIn:trip.checkIn,checkOut:trip.checkOut,confirmationCode:trip.confirmationCode,contact:"",notes:"",
  }].filter(stay=>Object.values(stay).some(Boolean));
  const status=getTripStatus(trip);

  const loadWeather=async(point?:GeoPoint|null)=>{
    setLoading(true);
    try{
      const resolved=point ?? (trip.customLocation ? {name:trip.customLocation.name,lat:trip.customLocation.lat,lon:trip.customLocation.lon} : await lookupLocation(siteCfg,trip.location));
      if(!resolved){setWeather(null);return;}
      setWeather(await fetchForecast(siteCfg,resolved));
    }finally{setLoading(false);}
  };

  const setCustomLocation=()=>{
    const next={name:customForm.name,lat:Number(customForm.lat),lon:Number(customForm.lon)};
    onUpdate(trip.id,{customLocation:next});
    void loadWeather(next);
    setShowCustomLoc(false);
  };

  useEffect(()=>{ void loadWeather(); },[trip.id,trip.location,trip.customLocation?.lat,trip.customLocation?.lon,siteCfg.weatherApi.forecastUrl,siteCfg.weatherApi.geocodeUrl]);

  const addNote=()=>{
    if(!noteText.trim()&&noteFiles.length===0)return;
    const note:TravelNote={id:uid("tn"),text:noteText.trim(),attachments:noteFiles,createdAt:new Date().toISOString(),authorId:user.id,authorName:dn(user)};
    onUpdate(trip.id,{travelNotes:[note,...trip.travelNotes]});
    setNoteText("");setNoteFiles([]);setUrlInput("");
  };

  const handleFileUpload=async(e:ChangeEvent<HTMLInputElement>)=>{
    const files=Array.from(e.target.files??[]);if(files.length===0)return;
    const uploads=await Promise.all(files.map(async file=>({url:await readFile(file),name:file.name})));
    setNoteFiles(f=>[...f,...uploads]);
    e.target.value="";
  };

  const addUrl=()=>{
    if(!urlInput.trim())return;
    const name=urlInput.trim().split("/").pop()||"Attachment";
    setNoteFiles(f=>[...f,{url:urlInput.trim(),name}]);
    setUrlInput("");
  };

  const removeNote=(nid:string)=>onUpdate(trip.id,{travelNotes:trip.travelNotes.filter(n=>n.id!==nid)});

  return <div className="grid xl:grid-cols-[minmax(0,1.65fr)_minmax(280px,340px)] gap-6">
    <div className="space-y-6">
      <Card th={th} className="p-8 lg:p-10">
        <div className="grid lg:grid-cols-[1.15fr_.85fr] gap-8">
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-3">
              <Badge label={`${t("status")}: ${t(status)}`} th={th} color={getStatusColor(status)}/>
              <Badge label={`${trip.duration} ${t("days")}`} th={th} color="blue"/>
              <Btn th={th} v="sec" sz="sm" onClick={()=>exportTripToPdf(trip, memberProfiles, t)}>🧾 {t("exportPdf")}</Btn>
            </div>
            <div>
              <p className={cx("text-sm uppercase tracking-[0.22em] mb-3",th==="dark"?"text-cyan-300":"text-blue-700")}>{t("overview")}</p>
              <h2 className="text-4xl font-black leading-tight">{trip.title}</h2>
              <p className={cx("mt-3 text-xl font-medium",th==="dark"?"text-slate-200":"text-slate-700")}>{trip.location}</p>
              <p className={cx("mt-2 max-w-2xl text-base",th==="dark"?"text-slate-400":"text-slate-500")}>{fmtDate(trip.startDate)} - {fmtDate(trip.endDate)}</p>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className={cx("rounded-3xl p-5",th==="dark"?"bg-white/[0.04]":"bg-slate-100")}>
                <p className={cx("text-sm",th==="dark"?"text-slate-400":"text-slate-500")}>{t("dates")}</p>
                <p className="mt-2 text-lg font-semibold leading-snug">{fmtDate(trip.startDate)}<br />{fmtDate(trip.endDate)}</p>
              </div>
              <div className={cx("rounded-3xl p-5",th==="dark"?"bg-white/[0.04]":"bg-slate-100")}>
                <p className={cx("text-sm",th==="dark"?"text-slate-400":"text-slate-500")}>{t("members")}</p>
                <p className="mt-2 text-3xl font-bold">{memberProfiles.length}</p>
              </div>
              <div className={cx("rounded-3xl p-5",th==="dark"?"bg-white/[0.04]":"bg-slate-100")}>
                <p className={cx("text-sm",th==="dark"?"text-slate-400":"text-slate-500")}>{t("flightDetails")}</p>
                <p className="mt-2 text-lg font-semibold">{flightLegs.map(leg=>leg.flightNumber).filter(Boolean).join(", ") || "—"}</p>
              </div>
              <div className={cx("rounded-3xl p-5",th==="dark"?"bg-white/[0.04]":"bg-slate-100")}>
                <p className={cx("text-sm",th==="dark"?"text-slate-400":"text-slate-500")}>{t("hotelDetails")}</p>
                <p className="mt-2 text-lg font-semibold">{hotels.length || 0} {hotels.length===1?t("hotelDetails"):t("hotelStays")}</p>
              </div>
            </div>
          </div>

          <div className={cx("rounded-[2rem] border p-6",th==="dark"?"border-white/8 bg-white/[0.03]":"border-slate-200 bg-slate-50")}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className={cx("text-sm uppercase tracking-[0.2em]",th==="dark"?"text-slate-400":"text-slate-500")}>{t("members")}</p>
                <p className="mt-2 text-2xl font-bold">{memberProfiles.length}</p>
              </div>
              <button onClick={()=>copyText(trip.id)} className={cx("rounded-full px-4 py-2 text-sm font-semibold transition",th==="dark"?"bg-cyan-400/15 text-cyan-300 hover:bg-cyan-400/25":"bg-blue-100 text-blue-700 hover:bg-blue-200")}>{trip.id} · {t("copyId")}</button>
            </div>
            <div className="mt-6 space-y-3">
              {memberProfiles.map(member=><div key={member.id} className={cx("flex items-center gap-3 rounded-2xl px-4 py-3",th==="dark"?"bg-white/[0.04]":"bg-white")}> 
                <Avatar name={dn(member)} th={th}/>
                <div className="min-w-0">
                  <p className="font-semibold truncate">{dn(member)}</p>
                  <p className={cx("text-sm truncate",th==="dark"?"text-slate-400":"text-slate-500")}>@{member.accountName}{member.id===trip.ownerId?` · ${t("owner")}`:""}</p>
                </div>
              </div>)}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card th={th} className="p-8 space-y-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-3xl font-bold">{t("flightLegs")}</h3>
              <p className={cx("mt-1 text-sm",th==="dark"?"text-slate-400":"text-slate-500")}>{flightLegs.length===0?t("noFlightDetails"):tripFlightSummary(trip).join(" · ")}</p>
            </div>
            <Badge label={`${flightLegs.length}`} th={th} color="blue"/>
          </div>
          {flightLegs.length===0?<p className={cx("text-sm",th==="dark"?"text-slate-400":"text-slate-500")}>{t("noFlightDetails")}</p>
          :<div className="space-y-5">{flightLegs.map((leg,index)=><div key={leg.id} className={cx("rounded-[1.9rem] border p-7 min-h-[20rem]",th==="dark"?"border-white/8 bg-white/[0.03]":"border-slate-200 bg-slate-50")}>
            <DetailHeader
              title={[leg.airline, leg.flightNumber].filter(Boolean).join(" ") || `${t("flightDetails")} ${index+1}`}
              subtitle={`${leg.departureAirport || "—"} → ${leg.arrivalAirport || "—"}`}
              badge={`${t("flightDetails")} ${index+1}`}
              th={th}
            />
            <div className="mt-5 grid gap-4 xl:grid-cols-2">
              <InfoRow label={t("departureTime")} value={leg.departureTime ? fmtDate(leg.departureTime) : "—"} th={th}/>
              <InfoRow label={t("arrivalTime")} value={leg.arrivalTime ? fmtDate(leg.arrivalTime) : "—"} th={th}/>
              <InfoRow label={t("terminal")} value={leg.terminal || "—"} th={th}/>
              <InfoRow label={t("bookingReference")} value={leg.bookingReference || "—"} th={th}/>
            </div>
            {leg.notes&&<div className={cx("mt-5 rounded-2xl border p-4",th==="dark"?"border-white/10 bg-white/[0.04]":"border-slate-200 bg-white")}>
              <p className={cx("text-xs font-semibold uppercase tracking-[0.16em]",th==="dark"?"text-slate-400":"text-slate-500")}>{t("legNotes")}</p>
              <p className={cx("mt-2 text-sm leading-6 break-words whitespace-pre-wrap",th==="dark"?"text-slate-200":"text-slate-700")}>{leg.notes}</p>
            </div>}
          </div>)}</div>}
        </Card>

        <Card th={th} className="p-8 space-y-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-3xl font-bold">{t("hotelStays")}</h3>
              <p className={cx("mt-1 text-sm",th==="dark"?"text-slate-400":"text-slate-500")}>{hotels.length===0?t("noHotelDetails"):tripHotelSummary(trip).join(" · ")}</p>
            </div>
            <Badge label={`${hotels.length}`} th={th} color="green"/>
          </div>
          {hotels.length===0?<p className={cx("text-sm",th==="dark"?"text-slate-400":"text-slate-500")}>{t("noHotelDetails")}</p>
          :<div className="space-y-5">{hotels.map((hotel,index)=><div key={hotel.id} className={cx("rounded-[1.9rem] border p-7 min-h-[20rem]",th==="dark"?"border-white/8 bg-white/[0.03]":"border-slate-200 bg-slate-50")}>
            <DetailHeader
              title={hotel.hotelName || `${t("hotelDetails")} ${index+1}`}
              subtitle={hotel.hotelAddress || "—"}
              badge={`${t("hotelDetails")} ${index+1}`}
              th={th}
            />
            <div className="mt-5 grid gap-4 xl:grid-cols-2">
              <InfoRow label={t("roomType")} value={hotel.roomType || "—"} th={th}/>
              <InfoRow label={t("propertyContact")} value={hotel.contact || "—"} th={th}/>
              <InfoRow label={t("checkIn")} value={hotel.checkIn ? fmtDate(hotel.checkIn) : "—"} th={th}/>
              <InfoRow label={t("checkOut")} value={hotel.checkOut ? fmtDate(hotel.checkOut) : "—"} th={th}/>
              <InfoRow label={t("confirmationCode")} value={hotel.confirmationCode || "—"} th={th}/>
            </div>
            {hotel.notes&&<div className={cx("mt-5 rounded-2xl border p-4",th==="dark"?"border-white/10 bg-white/[0.04]":"border-slate-200 bg-white")}>
              <p className={cx("text-xs font-semibold uppercase tracking-[0.16em]",th==="dark"?"text-slate-400":"text-slate-500")}>{t("stayNotes")}</p>
              <p className={cx("mt-2 text-sm leading-6 break-words whitespace-pre-wrap",th==="dark"?"text-slate-200":"text-slate-700")}>{hotel.notes}</p>
            </div>}
          </div>)}</div>}
        </Card>
      </div>

      <Card th={th} className="p-7 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-2xl font-bold">{t("travelNotes")}</h3>
          <Btn th={th} sz="sm" onClick={addNote}>+ {t("addNote")}</Btn>
        </div>
        <Textarea th={th} value={noteText} onChange={e=>setNoteText(e.target.value)} placeholder={t("noteText")} className="min-h-32"/>
        <div className="flex flex-wrap gap-3 items-center">
          <label className={cx("file-label",th==="dark"?"bg-white/5 text-slate-300 hover:bg-white/10":"bg-slate-100 text-slate-700 hover:bg-slate-200")}>
            📎 {t("uploadFile")}<input type="file" multiple onChange={handleFileUpload}/>
          </label>
          <div className="flex flex-1 min-w-[220px] gap-2">
            <Input th={th} value={urlInput} onChange={e=>setUrlInput(e.target.value)} placeholder={t("fileUrl")} className="flex-1"/>
            <Btn th={th} v="sec" sz="sm" onClick={addUrl}>{t("add")}</Btn>
          </div>
        </div>
        {noteFiles.length>0&&<div className="space-y-2">{noteFiles.map((file,index)=><div key={`${file.name}-${index}`} className={cx("flex items-center justify-between gap-3 rounded-2xl px-4 py-3",th==="dark"?"bg-white/6":"bg-slate-100")}>
          <span className="truncate font-medium">{file.name}</span>
          <button onClick={()=>setNoteFiles(files=>files.filter((_,fileIndex)=>fileIndex!==index))} className="text-rose-400">✕</button>
        </div>)}</div>}
        {trip.travelNotes.length===0?<Empty icon="📝" title={t("noNotes")} desc={t("noNotesDesc")} th={th}/>
        :<div className="space-y-4">{trip.travelNotes.map(note=><div key={note.id} className={cx("rounded-3xl p-5 border",th==="dark"?"border-white/8 bg-white/[0.03]":"border-slate-200 bg-slate-50")}>
          <div className="mb-3 flex items-start justify-between gap-4">
            <div>
              <p className="font-semibold">{note.authorName}</p>
              <p className={cx("text-xs",th==="dark"?"text-slate-500":"text-slate-400")}>{new Date(note.createdAt).toLocaleString()}</p>
            </div>
            <button onClick={()=>removeNote(note.id)} className="text-rose-400 opacity-70 hover:opacity-100">✕</button>
          </div>
          {note.text&&<p className="mb-4 whitespace-pre-wrap">{note.text}</p>}
          {note.attachments.length>0&&<div className="grid sm:grid-cols-2 gap-3">{note.attachments.map((att,index)=><a key={`${att.url}-${index}`} href={att.url} target="_blank" rel="noreferrer" download={att.name} className={cx("flex items-center justify-between gap-3 rounded-2xl px-4 py-3 border transition",th==="dark"?"border-white/8 bg-white/[0.03] hover:bg-white/[0.06] text-cyan-300":"border-slate-200 bg-white hover:bg-slate-50 text-blue-700")}>
            <span className="truncate font-medium">{att.name}</span>
            <span className="text-xs uppercase tracking-[0.18em]">{t("downloadAttachment")}</span>
          </a>)}</div>}
        </div>)}</div>}
      </Card>
    </div>

    <Card th={th} className="sticky top-6 h-fit space-y-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className={cx("text-sm uppercase tracking-[0.2em]",th==="dark"?"text-slate-400":"text-slate-500")}>{t("weather")}</p>
          <h3 className="mt-1 text-xl font-bold leading-snug">{trip.customLocation?.name||trip.location}</h3>
        </div>
        <Btn th={th} v="sec" sz="sm" onClick={()=>void loadWeather()} disabled={loading}>{loading?t("loading"):t("refreshWeather")}</Btn>
      </div>
      {trip.customLocation&&<p className={cx("text-sm",th==="dark"?"text-cyan-300":"text-blue-700")}>{t("savedLocation")}: {trip.customLocation.name}</p>}
      <Btn th={th} v="ghost" sz="sm" onClick={()=>setShowCustomLoc(true)}>{t("customLocation")}</Btn>
      {!weather?<p className={cx("text-sm",th==="dark"?"text-slate-400":"text-slate-500")}>{t("noWeatherLocation")}</p>
      :<>
        <div className={cx("rounded-[2rem] border p-6",th==="dark"?"border-white/8 bg-white/[0.04]":"border-slate-200 bg-slate-50")}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-4xl font-black">{Math.round(weather.current.temp)}°</p>
              <p className={cx("mt-1",th==="dark"?"text-slate-300":"text-slate-600")}>{weather.current.condition}</p>
            </div>
            <span className="text-4xl">{weatherEmoji[weather.current.condition]||"🌍"}</span>
          </div>
          <div className={cx("mt-5 grid grid-cols-3 gap-3 text-sm",th==="dark"?"text-slate-300":"text-slate-600")}>
            <div><p className="opacity-60">H</p><p>{Math.round(weather.current.high)}°C</p></div>
            <div><p className="opacity-60">L</p><p>{Math.round(weather.current.low)}°C</p></div>
            <div><p className="opacity-60">Wind</p><p>{Math.round(weather.current.wind)} km/h</p></div>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
          {weather.forecast.map(day=><div key={day.date} className={cx("rounded-2xl border p-3.5",th==="dark"?"border-white/8 bg-white/[0.03]":"border-slate-200 bg-slate-50")}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{formatForecastDate(day.date)}</p>
                <p className={cx("text-sm mt-1",th==="dark"?"text-slate-400":"text-slate-500")}>{day.condition}</p>
              </div>
              <span className="text-xl">{weatherEmoji[day.condition]||"🌤️"}</span>
            </div>
            <p className={cx("mt-2 text-xs",th==="dark"?"text-slate-300":"text-slate-600")}>{Math.round(day.high)}° / {Math.round(day.low)}°</p>
          </div>)}
        </div>
      </>}
    </Card>

    <Modal open={showCustomLoc} onClose={()=>setShowCustomLoc(false)} th={th} title={t("customLocation")}>
      <div className="space-y-4">
        <Input th={th} label={t("locationName")} value={customForm.name} onChange={e=>setCustomForm(f=>({...f,name:e.target.value}))}/>
        <Input th={th} label={t("latitude")} type="number" step="any" value={customForm.lat} onChange={e=>setCustomForm(f=>({...f,lat:+e.target.value}))}/>
        <Input th={th} label={t("longitude")} type="number" step="any" value={customForm.lon} onChange={e=>setCustomForm(f=>({...f,lon:+e.target.value}))}/>
        <div className="flex justify-end gap-2">
          <Btn th={th} v="sec" onClick={()=>setShowCustomLoc(false)}>{t("cancel")}</Btn>
          <Btn th={th} onClick={setCustomLocation}>{t("setCustom")}</Btn>
        </div>
      </div>
    </Modal>
  </div>;
}

function TripTravelers({trip,profiles,th,t}:{trip:Trip;profiles:Profile[];th:ThemeMode;t:(k:TKey)=>string}){
  const members=trip.members.map(id=>profiles.find(profile=>profile.id===id)).filter(Boolean) as Profile[];

  const memberStats=members.map(member=>{
    const paid=trip.expenses.filter(exp=>exp.paidBy===member.id).reduce((sum,exp)=>sum+exp.amount,0);
    const expenseTouches=trip.expenses.filter(exp=>exp.participants.includes(member.id) || exp.paidBy===member.id).length;
    return {member,paid,expenseTouches};
  });

  return <div className="space-y-5">
    <Card th={th} className="p-6 h-fit lg:sticky lg:top-6">
      <div className="grid sm:grid-cols-3 gap-3">
        <div className={cx("rounded-2xl p-4",th==="dark"?"bg-white/[0.04]":"bg-slate-100")}>
          <p className={cx("text-xs uppercase tracking-[0.16em]",th==="dark"?"text-slate-400":"text-slate-500")}>{t("members")}</p>
          <p className="mt-2 text-2xl font-bold">{members.length}</p>
        </div>
        <div className={cx("rounded-2xl p-4",th==="dark"?"bg-white/[0.04]":"bg-slate-100")}>
          <p className={cx("text-xs uppercase tracking-[0.16em]",th==="dark"?"text-slate-400":"text-slate-500")}>{t("expenses")}</p>
          <p className="mt-2 text-2xl font-bold">{trip.expenses.length}</p>
        </div>
      </div>
    </Card>

    <div className="grid xl:grid-cols-2 gap-5">
      {memberStats.map(({member,paid,expenseTouches})=><Card key={member.id} th={th} className="p-7 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-4">
            <Avatar name={dn(member)} th={th}/>
            <div>
              <p className="text-xl font-semibold">{dn(member)}</p>
              <p className={cx("text-sm",th==="dark"?"text-slate-400":"text-slate-500")}>@{member.accountName}</p>
            </div>
          </div>
          <Badge label={member.id===trip.ownerId?t("owner"):t("travelers")} th={th} color={member.id===trip.ownerId?"purple":"blue"}/>
        </div>

        <div className="grid sm:grid-cols-2 gap-2">
          <div className={cx("rounded-2xl p-3",th==="dark"?"bg-white/[0.04]":"bg-slate-100")}>
            <p className={cx("text-xs",th==="dark"?"text-slate-400":"text-slate-500")}>{t("totalPaid")}</p>
            <p className="mt-1 font-semibold">{fmtCur(paid)}</p>
          </div>
          <div className={cx("rounded-2xl p-3",th==="dark"?"bg-white/[0.04]":"bg-slate-100")}>
            <p className={cx("text-xs",th==="dark"?"text-slate-400":"text-slate-500")}>{t("expenses")}</p>
            <p className="mt-1 font-semibold">{expenseTouches}</p>
          </div>
        </div>

        <div className="grid gap-2">
          <InfoRow label={t("tripId")} value={trip.id} th={th}/>
          <InfoRow label={t("status")} value={member.id===trip.ownerId?t("owner"):t("travelers")} th={th}/>
          <InfoRow label={t("email")} value={member.email} th={th}/>
          <InfoRow label={t("phone")} value={member.phone} th={th}/>
          {member.nationality&&<InfoRow label={t("nationality")} value={member.nationality} th={th}/>} 
          {member.passportNumber&&<InfoRow label={t("passport")} value={member.passportNumber} th={th}/>} 
          {member.passportExpiryDate&&<InfoRow label={t("passportExpiry")} value={fmtDate(member.passportExpiryDate)} th={th}/>} 
          {member.homeAirport&&<InfoRow label={t("homeAirport")} value={member.homeAirport} th={th}/>} 
          {member.emergencyContact&&<InfoRow label={t("emergencyContact")} value={member.emergencyContact} th={th}/>} 
        </div>
        {member.dietaryNotes&&<div className={cx("rounded-2xl p-4",th==="dark"?"bg-white/[0.04] text-slate-300":"bg-slate-100 text-slate-700")}>
          <p className={cx("text-sm mb-2",th==="dark"?"text-slate-400":"text-slate-500")}>{t("dietaryNotes")}</p>
          <p className="whitespace-pre-wrap">{member.dietaryNotes}</p>
        </div>}
      </Card>)}
    </div>
  </div>;
}

function TripItinerary({trip,th,t,onUpdate,onTripUpdate}:{trip:Trip;th:ThemeMode;t:(k:TKey)=>string;onUpdate:(tid:string,items:ItineraryItem[])=>void;onTripUpdate:(id:string,d:Partial<Trip>)=>void}){
  const emptyForm={startTime:"09:00",endTime:"10:00",endDayOffset:0,title:"",stopLocation:"",transport:"Walk",details:"",photo:"",mapUrl:""};
  const emptyOptionalForm={day:1,type:"site" as OptionalStop["type"],title:"",location:"",url:"",notes:""};
  const [activePane,setActivePane]=useState<"schedule"|"saved">("schedule");
  const [day,setDay]=useState(1);
  const [form,setForm]=useState(emptyForm);
  const [editId,setEditId]=useState<string|null>(null);
  const [transportEditId,setTransportEditId]=useState<string|null>(null);
  const [transportForm,setTransportForm]=useState({duration:"",details:""});
  const [optionalForm,setOptionalForm]=useState(emptyOptionalForm);
  const [optionalEditId,setOptionalEditId]=useState<string|null>(null);

  const dayItems=trip.itinerary.filter(it=>it.day===day).sort((a,b)=>a.order-b.order);
  const optionalDayItems=trip.optionalStops.filter(stop=>stop.day===day);
  const nextOrder=(trip.itinerary.filter(it=>it.day===day).reduce((max,it)=>Math.max(max,it.order),0))+1;
  const totalItems=trip.itinerary.length;
  const photoCount=trip.itinerary.filter(it=>Boolean(it.photo)).length;

  const shouldKeepManualTransit=(transit?:TransitLeg)=>{
    if(!transit?.duration&&!transit?.details) return false;
    const details=(transit.details||"").toLowerCase();
    return !details.startsWith("auto •");
  };

  const autoFillTransit=async(items:ItineraryItem[])=>{
    if(items.length<2) return items;
    const ordered=items.slice().sort((a,b)=>a.order-b.order);
    const withTransit=[...ordered];

    for(let i=0;i<withTransit.length;i++){
      if(i===withTransit.length-1){
        withTransit[i]={...withTransit[i],transitToNext:{duration:"",details:""}};
        continue;
      }
      const cur=withTransit[i];
      const nxt=withTransit[i+1];
      if(shouldKeepManualTransit(cur.transitToNext)) continue;
      if(!cur.stopLocation||!nxt.stopLocation) continue;
      try{
        const [aRes,bRes]=await Promise.all([
          fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(cur.stopLocation)}`),
          fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(nxt.stopLocation)}`),
        ]);
        const [aJson,bJson]=await Promise.all([aRes.json(),bRes.json()]);
        const a=Array.isArray(aJson)&&aJson[0]?{lat:Number(aJson[0].lat),lon:Number(aJson[0].lon)}:null;
        const b=Array.isArray(bJson)&&bJson[0]?{lat:Number(bJson[0].lat),lon:Number(bJson[0].lon)}:null;
        if(a&&b){
          const dist=haversineKm(a,b);
          withTransit[i]={...cur,transitToNext:{duration:estimateDurationByDistanceKm(dist,cur.transport),details:`Auto • Approx. ${dist.toFixed(1)} km`}};
        }
      }catch{}
    }
    return withTransit;
  };

  const persistWithAutoTransit=async(nextItems:ItineraryItem[],targetDay:number)=>{
    const dayUpdated=nextItems.filter(it=>it.day===targetDay);
    const autoDay=await autoFillTransit(dayUpdated);
    const map=new Map(autoDay.map(it=>[it.id,it]));
    onUpdate(trip.id,nextItems.map(it=>it.day===targetDay?(map.get(it.id)??it):it));
  };

  const saveActivity=async(e:React.FormEvent)=>{
    e.preventDefault();
    if(!form.title.trim())return;
    const payload={
      startTime:form.startTime,
      endTime:form.endTime,
      endDayOffset:form.endDayOffset,
      title:form.title,
      stopLocation:form.stopLocation,
      transport:form.transport,
      details:form.details,
      photo:form.photo,
      mapUrl:form.mapUrl||googleMapEmbedUrl(form.stopLocation),
    };
    const next=editId
      ? trip.itinerary.map(it=>it.id===editId?{...it,...payload,day}:it)
      : [...trip.itinerary,{id:uid("it"),day,order:nextOrder,...payload,transitToNext:{duration:"",details:""}}];
    await persistWithAutoTransit(next,day);
    setEditId(null);
    setForm(emptyForm);
  };

  const move=async(idx:number,dir:1|-1)=>{
    const swapWith=idx+dir;
    if(swapWith<0||swapWith>=dayItems.length)return;
    const reordered=[...dayItems];
    [reordered[idx],reordered[swapWith]]=[reordered[swapWith],reordered[idx]];
    const orderMap=new Map(reordered.map((item,index)=>[item.id,index+1]));
    const next=trip.itinerary.map(it=>it.day===day?{...it,order:orderMap.get(it.id)??it.order}:it);
    await persistWithAutoTransit(next,day);
  };

  const remove=async(id:string)=>{
    const remaining=trip.itinerary.filter(it=>it.id!==id);
    const remainingDay=remaining.filter(it=>it.day===day).sort((a,b)=>a.order-b.order);
    const orderMap=new Map(remainingDay.map((item,index)=>[item.id,index+1]));
    const next=remaining.map(it=>it.day===day?{...it,order:orderMap.get(it.id)??it.order}:it);
    await persistWithAutoTransit(next,day);
  };

  const edit=(it:ItineraryItem)=>{
    setForm({ startTime:it.startTime,endTime:it.endTime,endDayOffset:it.endDayOffset??0,title:it.title,stopLocation:it.stopLocation ?? "",transport:it.transport,details:it.details,photo:it.photo??"",mapUrl:it.mapUrl??"" });
    setEditId(it.id);
    setDay(it.day);
    setActivePane("schedule");
  };

  const handlePhotoUpload=async(e:ChangeEvent<HTMLInputElement>)=>{
    const file=e.target.files?.[0];
    if(!file)return;
    const photo=await readFile(file);
    setForm(f=>({...f,photo}));
    e.target.value="";
  };

  const startTransportEdit=(it:ItineraryItem)=>{
    setTransportEditId(it.id);
    setTransportForm({duration:it.transitToNext?.duration??"",details:it.transitToNext?.details??""});
  };

  const saveTransport=(itemId:string)=>{
    onUpdate(trip.id,trip.itinerary.map(it=>it.id===itemId?{...it,transitToNext:{duration:transportForm.duration,details:transportForm.details}}:it));
    setTransportEditId(null);
    setTransportForm({duration:"",details:""});
  };

  const clearTransport=(itemId:string)=>{
    onUpdate(trip.id,trip.itinerary.map(it=>it.id===itemId?{...it,transitToNext:{duration:"",details:""}}:it));
    setTransportEditId(null);
    setTransportForm({duration:"",details:""});
  };

  const saveOptionalStop=(e:React.FormEvent)=>{
    e.preventDefault();
    if(!optionalForm.title.trim()) return;
    const normalized={...optionalForm, day:Math.min(Math.max(optionalForm.day,1),trip.duration)};
    const next = optionalEditId
      ? trip.optionalStops.map(stop=>stop.id===optionalEditId?{...stop,...normalized}:stop)
      : [{id:uid("opt"),...normalized}, ...trip.optionalStops];
    onTripUpdate(trip.id,{optionalStops:next});
    setOptionalEditId(null);
    setOptionalForm({...emptyOptionalForm,day});
  };

  const editOptionalStop=(stop:OptionalStop)=>{
    setOptionalEditId(stop.id);
    setOptionalForm({day:stop.day,type:stop.type,title:stop.title,location:stop.location,url:stop.url,notes:stop.notes});
    setDay(stop.day);
    setActivePane("saved");
  };

  const removeOptionalStop=(id:string)=>onTripUpdate(trip.id,{optionalStops:trip.optionalStops.filter(stop=>stop.id!==id)});

  useEffect(()=>{
    setOptionalForm(current=>current.day===day?current:{...current,day});
  },[day]);

  return <div className="grid gap-6 lg:grid-cols-[1.45fr_.95fr]">
    <div className="space-y-5">
      <Card th={th} className="p-5 space-y-4">
        <div className="grid sm:grid-cols-4 gap-3">
          <div className={cx("rounded-2xl p-4",th==="dark"?"bg-white/[0.04]":"bg-slate-100")}><p className={cx("text-xs",th==="dark"?"text-slate-400":"text-slate-500")}>{t("itinerary")}</p><p className="mt-1 text-2xl font-bold">{totalItems}</p></div>
          <div className={cx("rounded-2xl p-4",th==="dark"?"bg-white/[0.04]":"bg-slate-100")}><p className={cx("text-xs",th==="dark"?"text-slate-400":"text-slate-500")}>{t("day")}</p><p className="mt-1 text-2xl font-bold">{day}/{trip.duration}</p></div>
          <div className={cx("rounded-2xl p-4",th==="dark"?"bg-white/[0.04]":"bg-slate-100")}><p className={cx("text-xs",th==="dark"?"text-slate-400":"text-slate-500")}>{t("itineraryPhoto")}</p><p className="mt-1 text-2xl font-bold">{photoCount}</p></div>
          <div className={cx("rounded-2xl p-4",th==="dark"?"bg-white/[0.04]":"bg-slate-100")}><p className={cx("text-xs",th==="dark"?"text-slate-400":"text-slate-500")}>{t("optionalPlaces")}</p><p className="mt-1 text-2xl font-bold">{trip.optionalStops.length}</p></div>
        </div>
      </Card>

      <Card th={th} className="p-8">
        <div className="mb-6 flex items-center gap-2 overflow-x-auto pb-2">
          {Array.from({length:trip.duration},(_,i)=>i+1).map(d=><button key={d} onClick={()=>setDay(d)} className={cx("rounded-2xl px-4 py-2.5 font-medium whitespace-nowrap transition border",d===day?(th==="dark"?"bg-cyan-400 text-slate-950 border-cyan-300":"bg-slate-800 text-white border-slate-700"):(th==="dark"?"bg-white/5 text-slate-400 hover:bg-white/10 border-white/10":"bg-slate-100 text-slate-600 hover:bg-slate-200 border-slate-200"))}>{t("day")} {d}</button>)}
        </div>

        <Tabs tabs={[{id:"schedule",label:t("itinerarySchedule"),icon:"🗓️"},{id:"saved",label:t("optionalPlaces"),icon:"📌"}]} active={activePane} onChange={setActivePane} th={th}/>

        {activePane==="schedule" ? (dayItems.length===0?<div className="mt-6"><Empty icon="🗓️" title={t("noItinerary")} desc={t("noItineraryDesc")} th={th}/></div>:<div className="mt-6 space-y-5">{dayItems.map((it,idx)=><div key={it.id} className="space-y-3 relative">
          {idx<dayItems.length-1&&<span className={cx("absolute left-[18px] top-14 h-[calc(100%-1.2rem)] w-px",th==="dark"?"bg-white/10":"bg-slate-200")}/>}<Card th={th} className={cx("p-5 rounded-3xl",it.transport==="Flight"?(th==="dark"?"bg-indigo-500/10 border-indigo-400/40":"bg-indigo-50 border-indigo-200"):"")}>
            <div className="flex items-start gap-4">
              <div className="flex flex-col gap-1"><button onClick={()=>move(idx,-1)} disabled={idx===0} className="text-lg opacity-60 hover:opacity-100 disabled:opacity-20">▲</button><button onClick={()=>move(idx,1)} disabled={idx===dayItems.length-1} className="text-lg opacity-60 hover:opacity-100 disabled:opacity-20">▼</button></div>
              <div className="flex-1">
                <div className="mb-2 flex items-start justify-between gap-3"><div><p className={cx("text-sm font-mono",th==="dark"?"text-cyan-400":"text-blue-600")}>{it.startTime} - {it.endTime}{(it.endDayOffset??0)>0?` (+${it.endDayOffset}d)`:""}</p><p className="text-lg font-bold">{it.title}</p></div><Badge label={it.transport} th={th}/></div>
                {it.stopLocation&&<p className={cx("mb-2 text-sm",th==="dark"?"text-cyan-300":"text-blue-700")}>📍 {it.stopLocation}</p>}
                {it.details&&<p className={cx("text-sm leading-6",th==="dark"?"text-slate-400":"text-slate-500")}>{it.details}</p>}

                {(it.transitToNext?.duration||it.transitToNext?.details)&&<div className={cx("mt-3 rounded-xl border border-dashed px-3 py-2",th==="dark"?"border-white/20":"border-slate-300")}>
                  <p className="text-xs font-semibold uppercase">{t("transitTime")}</p>
                  {it.transitToNext?.duration&&<Badge label={it.transitToNext.duration} th={th} color="amber"/>}
                  {it.transitToNext?.details&&<p className="text-sm mt-1">{it.transitToNext.details}</p>}
                </div>}

                <div className="mt-2 flex gap-2">
                  <Btn th={th} v="sec" sz="sm" onClick={()=>startTransportEdit(it)}>{t("editTransportDetail")}</Btn>
                  {(it.transitToNext?.duration||it.transitToNext?.details)&&<Btn th={th} v="ghost" sz="sm" onClick={()=>clearTransport(it.id)}>{t("clearTransportDetail")}</Btn>}
                </div>

                {transportEditId===it.id&&<div className="mt-3 space-y-2">
                  <Input th={th} label={t("transitTime")} value={transportForm.duration} onChange={e=>setTransportForm(f=>({...f,duration:e.target.value}))}/>
                  <Textarea th={th} label={t("transitDetails")} value={transportForm.details} onChange={e=>setTransportForm(f=>({...f,details:e.target.value}))}/>
                  <div className="flex gap-2"><Btn th={th} sz="sm" onClick={()=>saveTransport(it.id)}>{t("save")}</Btn><Btn th={th} v="sec" sz="sm" onClick={()=>setTransportEditId(null)}>{t("cancel")}</Btn></div>
                </div>}

                {it.mapUrl&&<iframe src={it.mapUrl} title={`${it.title}-map`} loading="lazy" className="mt-3 h-40 w-full rounded-2xl border border-white/10"/>}
                {it.photo&&<img src={it.photo} alt={it.title} className="mt-4 h-32 w-full rounded-2xl border border-white/10 object-cover"/>}
              </div>
              <div className="flex gap-2"><button onClick={()=>edit(it)} className={cx("rounded-full px-2.5 py-1 text-sm",th==="dark"?"bg-white/10 hover:bg-white/20":"bg-slate-100 hover:bg-slate-200")}>✏️</button><button onClick={()=>remove(it.id)} className={cx("rounded-full px-2.5 py-1 text-sm text-rose-400",th==="dark"?"bg-rose-500/10 hover:bg-rose-500/20":"bg-rose-50 hover:bg-rose-100")}>✕</button></div>
            </div>
          </Card>
        </div>)}</div>) : (<div className="mt-6 space-y-4">
          {optionalDayItems.length===0?<Empty icon="📌" title={t("noOptionalPlaces")} desc={t("noOptionalPlacesDesc")} th={th}/>:optionalDayItems.map(stop=><Card key={stop.id} th={th} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-lg font-bold break-words">{stop.title}</p>
                  <Badge label={t(stop.type === "site" ? "sight" : stop.type === "restaurant" ? "restaurant" : "other")} th={th} color={stop.type === "restaurant" ? "amber" : stop.type === "other" ? "slate" : "green"}/>
                </div>
                <p className={cx("mt-2 text-sm",th==="dark"?"text-cyan-300":"text-blue-700")}>{stop.location || "—"}</p>
                {stop.notes&&<p className={cx("mt-2 text-sm leading-6 break-words whitespace-pre-wrap",th==="dark"?"text-slate-300":"text-slate-600")}>{stop.notes}</p>}
                {stop.url&&<a href={stop.url} target="_blank" rel="noreferrer" className={cx("mt-3 inline-flex text-sm font-semibold underline",th==="dark"?"text-cyan-300":"text-blue-700")}>{stop.url}</a>}
              </div>
              <div className="flex gap-2">
                <Btn th={th} v="sec" sz="sm" onClick={()=>editOptionalStop(stop)}>{t("edit")}</Btn>
                <Btn th={th} v="danger" sz="sm" onClick={()=>removeOptionalStop(stop.id)}>{t("remove")}</Btn>
              </div>
            </div>
          </Card>)}
        </div>)}
      </Card>
    </div>

    <Card th={th} className="p-6 h-fit lg:sticky lg:top-6">
      <div className="mb-4">
        <h3 className="text-xl font-bold">{activePane==="schedule" ? (editId?t("edit"):t("addActivity")) : (optionalEditId?t("editOptionalPlace"):t("addOptionalPlace"))}</h3>
        <p className={cx("mt-2 text-sm",th==="dark"?"text-slate-400":"text-slate-500")}>{activePane==="schedule" ? t("noItineraryDesc") : t("optionalPlacesDesc")}</p>
      </div>

      {activePane==="schedule" ? <form onSubmit={saveActivity} className="space-y-3">
        <Input th={th} label={t("startTime")} type="time" value={form.startTime} onChange={e=>setForm(f=>({...f,startTime:e.target.value}))}/>
        <Input th={th} label={t("endTime")} type="time" value={form.endTime} onChange={e=>setForm(f=>({...f,endTime:e.target.value}))}/>
        <Input th={th} label={t("endDayOffset")} type="number" min={0} value={form.endDayOffset} onChange={e=>setForm(f=>({...f,endDayOffset:Number(e.target.value)||0}))}/>
        <Input th={th} label={t("activity")} value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))}/>
        <Input th={th} label={t("stopLocation")} value={form.stopLocation} onChange={e=>setForm(f=>({...f,stopLocation:e.target.value,mapUrl:googleMapEmbedUrl(e.target.value)}))}/>
        <Input th={th} label={t("googleMapUrl")} value={form.mapUrl} onChange={e=>setForm(f=>({...f,mapUrl:e.target.value}))}/>
        {form.mapUrl&&<iframe src={form.mapUrl} title="activity-map-preview" loading="lazy" className="h-40 w-full rounded-2xl border border-white/10"/>}
        <Select th={th} label={t("transport")} value={form.transport} onChange={e=>setForm(f=>({...f,transport:e.target.value}))}>{ITINERARY_TRANSPORT_OPTIONS.map(option=><option key={option} value={option}>{option}</option>)}</Select>
        <Textarea th={th} label={t("details")} value={form.details} onChange={e=>setForm(f=>({...f,details:e.target.value}))}/>
        <div className="space-y-2">
          <label className={cx("file-label",th==="dark"?"bg-white/5 text-slate-300 hover:bg-white/10":"bg-slate-100 text-slate-700 hover:bg-slate-200")}>🖼 {t("uploadPhoto")}<input type="file" accept="image/*" onChange={handlePhotoUpload}/></label>
          <Input th={th} label={t("photoUrl")} value={form.photo} onChange={e=>setForm(f=>({...f,photo:e.target.value}))}/>
          {form.photo&&<img src={form.photo} alt="preview" className="h-24 w-full rounded-2xl border border-white/10 object-cover"/>}
        </div>
        <Btn th={th} type="submit">{editId?t("save"):t("add")}</Btn>
        {editId&&<Btn th={th} v="sec" type="button" onClick={()=>{setEditId(null);setForm(emptyForm);}}>{t("cancel")}</Btn>}
      </form> : <form onSubmit={saveOptionalStop} className="space-y-3">
        <Input th={th} label={t("day")} type="number" min={1} max={trip.duration} value={optionalForm.day} onChange={e=>setOptionalForm(f=>({...f,day:Number(e.target.value)||1}))}/>
        <Select th={th} label={t("placeType")} value={optionalForm.type} onChange={e=>setOptionalForm(f=>({...f,type:e.target.value as OptionalStop["type"]}))}>
          <option value="site">{t("sight")}</option>
          <option value="restaurant">{t("restaurant")}</option>
          <option value="other">{t("other")}</option>
        </Select>
        <Input th={th} label={t("placeName")} value={optionalForm.title} onChange={e=>setOptionalForm(f=>({...f,title:e.target.value}))}/>
        <Input th={th} label={t("optionalLocation")} value={optionalForm.location} onChange={e=>setOptionalForm(f=>({...f,location:e.target.value}))}/>
        <Input th={th} label={t("reservationLink")} value={optionalForm.url} onChange={e=>setOptionalForm(f=>({...f,url:e.target.value}))}/>
        <Textarea th={th} label={t("optionalPlaceNotes")} value={optionalForm.notes} onChange={e=>setOptionalForm(f=>({...f,notes:e.target.value}))}/>
        <Btn th={th} type="submit">{optionalEditId?t("save"):t("saveOptionalPlace")}</Btn>
        {optionalEditId&&<Btn th={th} v="sec" type="button" onClick={()=>{setOptionalEditId(null);setOptionalForm({...emptyOptionalForm,day});}}>{t("cancel")}</Btn>}
      </form>}
    </Card>
  </div>;
}

function TripExpenses({trip,user,profiles,th,t,onAdd,onRemove}:{trip:Trip;user:Profile;profiles:Profile[];th:ThemeMode;t:(k:TKey)=>string;onAdd:(tid:string,e:Omit<Expense,"id">)=>void;onRemove:(tid:string,eid:string)=>void}){
  const [form,setForm]=useState({date:new Date().toISOString().slice(0,10),title:"",amount:0,currency:"USD",category:"Food",paidBy:user.id,participants:[] as string[],notes:""});
  const [showForm,setShowForm]=useState(false);

  const members=trip.members.map(id=>profiles.find(p=>p.id===id)).filter(Boolean) as Profile[];
  const settlement=settlements(trip,profiles);
  const myBal=settlement.bal.find(b=>b.id===user.id);

  const toggleParticipant=(pid:string)=>{
    setForm(f=>({...f,participants:f.participants.includes(pid)?f.participants.filter(x=>x!==pid):[...f.participants,pid]}));
  };

  const add=(e:React.FormEvent)=>{
    e.preventDefault();
    if(!form.title.trim()||form.amount<=0)return;
    onAdd(trip.id,{...form,participants:form.participants.length?form.participants:members.map(m=>m.id)});
    setForm({date:new Date().toISOString().slice(0,10),title:"",amount:0,currency:"USD",category:"Food",paidBy:user.id,participants:[],notes:""});
    setShowForm(false);
  };

  const perPerson=form.amount/(form.participants.length||members.length||1);

  return <div className="grid lg:grid-cols-3 gap-6">
    <div className="lg:col-span-2 space-y-6">
      <Card th={th} className="p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">{t("expenses")}</h2>
          <Btn th={th} onClick={()=>setShowForm(true)}>+ {t("addExpense")}</Btn>
        </div>

        {/* Balance Summary */}
        {myBal&&<Card th={th} className="p-6 mb-6 bg-gradient-to-br from-blue-500/10 to-purple-500/10">
          <h3 className="text-xl font-bold mb-4">{t("balanceSummary")}</h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className={cx("text-sm mb-1",th==="dark"?"text-slate-400":"text-slate-500")}>{t("totalPaid")}</p>
              <p className="text-2xl font-bold text-emerald-400">{fmtCur(myBal.paid,trip.expenses[0]?.currency||"USD")}</p>
            </div>
            <div>
              <p className={cx("text-sm mb-1",th==="dark"?"text-slate-400":"text-slate-500")}>{t("myShare")}</p>
              <p className="text-2xl font-bold text-amber-400">{fmtCur(myBal.share,trip.expenses[0]?.currency||"USD")}</p>
            </div>
            <div>
              <p className={cx("text-sm mb-1",th==="dark"?"text-slate-400":"text-slate-500")}>{t("iOwe")}</p>
              <p className={cx("text-2xl font-bold",myBal.net<0?"text-rose-400":"text-cyan-400")}>
                {myBal.net<0?fmtCur(Math.abs(myBal.net),trip.expenses[0]?.currency||"USD"):"—"}
              </p>
            </div>
          </div>
        </Card>}

        {trip.expenses.length===0?<Empty icon="💰" title={t("noExpenses")} desc={t("noExpensesDesc")} th={th}/>
        :<div className="space-y-3">
          {trip.expenses.map(exp=>{
            const payer=members.find(m=>m.id===exp.paidBy);
            return <Card key={exp.id} th={th} className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-bold text-lg">{exp.title}</p>
                      <p className={cx("text-sm",th==="dark"?"text-slate-400":"text-slate-500")}>
                        {fmtDate(exp.date)} · {exp.category}
                      </p>
                    </div>
                    <p className="text-2xl font-bold text-cyan-400">{fmtCur(exp.amount,exp.currency)}</p>
                  </div>
                  <p className={cx("text-sm",th==="dark"?"text-slate-400":"text-slate-500")}>
                    {t("paidBy")}: {payer?dn(payer):"Unknown"} · {t("splitWith")}: {exp.participants.length||members.length} {t("members")}
                    {exp.participants.length>0&&<span className="ml-2">
                      ({exp.participants.map(pid=>members.find(m=>m.id===pid)).filter(Boolean).map(m=>dn(m!)).join(", ")})
                    </span>}
                  </p>
                  {exp.notes&&<p className={cx("text-sm mt-1",th==="dark"?"text-slate-300":"text-slate-600")}>{exp.notes}</p>}
                </div>
                <button onClick={()=>onRemove(trip.id,exp.id)} className="opacity-60 hover:opacity-100 text-rose-400 text-xl">✕</button>
              </div>
            </Card>;
          })}
        </div>}
      </Card>

      {settlement.sett.length>0&&<Card th={th} className="p-8">
        <h3 className="text-xl font-bold mb-4">{t("settlements")}</h3>
        <div className="space-y-2">
          {settlement.sett.map((s,i)=><p key={i} className={cx("text-sm",th==="dark"?"text-slate-300":"text-slate-600")}>
            <span className="font-semibold">{s.from}</span> {t("owes")} <span className="font-semibold">{s.to}</span>: <span className="text-cyan-400 font-bold">{fmtCur(s.amount,trip.expenses[0]?.currency||"USD")}</span>
          </p>)}
        </div>
      </Card>}
    </div>

    <Modal open={showForm} onClose={()=>setShowForm(false)} th={th} title={t("addExpense")}>
      <form onSubmit={add} className="space-y-4">
        <Input th={th} label={t("date")} type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}/>
        <Input th={th} label={t("activity")} value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))}/>
        <div className="grid grid-cols-2 gap-3">
          <Input th={th} label={t("amount")} type="number" step="0.01" value={form.amount||""} onChange={e=>setForm(f=>({...f,amount:+e.target.value}))}/>
          <Select th={th} label={t("currency")} value={form.currency} onChange={e=>setForm(f=>({...f,currency:e.target.value}))}>
            {CURRENCIES.map(c=><option key={c} value={c}>{c}</option>)}
          </Select>
        </div>
        <Select th={th} label={t("category")} value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}>
          {EXPENSE_CATS.map(c=><option key={c} value={c}>{c}</option>)}
        </Select>
        <Select th={th} label={t("paidBy")} value={form.paidBy} onChange={e=>setForm(f=>({...f,paidBy:e.target.value}))}>
          {members.map(m=><option key={m.id} value={m.id}>{dn(m)}</option>)}
        </Select>
        <div>
          <p className={cx("text-sm mb-2",th==="dark"?"text-slate-300":"text-slate-600")}>{t("splitWith")} ({form.participants.length||members.length})</p>
          <div className="flex flex-wrap gap-2">
            {members.map(m=><button key={m.id} type="button" onClick={()=>toggleParticipant(m.id)}
              className={cx("px-3 py-1.5 rounded-full text-sm font-medium transition",
                form.participants.includes(m.id)||(form.participants.length===0)
                  ?(th==="dark"?"bg-cyan-400 text-slate-950":"bg-slate-800 text-white")
                  :(th==="dark"?"bg-white/5 text-slate-400":"bg-slate-100 text-slate-500"))}>
              {dn(m)}
            </button>)}
          </div>
          <p className={cx("text-sm mt-2",th==="dark"?"text-slate-400":"text-slate-500")}>
            {t("perPerson")}: {fmtCur(perPerson,form.currency)}
          </p>
        </div>
        <Textarea th={th} label={t("expNotes")} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/>
        <Btn th={th} type="submit">{t("add")}</Btn>
      </form>
    </Modal>
  </div>;
}

function TripLuggage({trip,siteCfg,th,t,onAdd,onToggle,onRemove}:{trip:Trip;siteCfg:SiteSettings;th:ThemeMode;t:(k:TKey)=>string;onAdd:(tid:string,l:string,cat:string)=>void;onToggle:(tid:string,iid:string)=>void;onRemove:(tid:string,iid:string)=>void}){
  const [cat,setCat]=useState<string>("all");
  const [newItem,setNewItem]=useState("");
  const [monthlyClimate,setMonthlyClimate]=useState<WeatherData["monthlyClimate"]>([]);
  const [climateLoading,setClimateLoading]=useState(false);

  const cats=siteCfg.luggageCategories||[];
  const filteredItems=cat==="all"?trip.packingList:trip.packingList.filter(it=>it.category===cat);
  const packed=filteredItems.filter(it=>it.packed).length;
  const packedPct=filteredItems.length?Math.round((packed/filteredItems.length)*100):0;
  const groupedItems=(cat==="all"?cats.map(c=>c.name):[cat]).map(categoryName=>({
    categoryName,
    items: filteredItems.filter(item=>item.category===categoryName),
  })).filter(group=>group.items.length>0);
  const tripMonths=new Set<number>();
  if(trip.startDate&&trip.endDate){
    const cursor=new Date(trip.startDate);
    const end=new Date(trip.endDate);
    while(cursor<=end){
      tripMonths.add(cursor.getMonth());
      cursor.setMonth(cursor.getMonth()+1,1);
    }
  }

  const add=(e:React.FormEvent)=>{
    e.preventDefault();
    if(!newItem.trim())return;
    const category=cat==="all"?cats[0]?.name||"Misc":cat;
    onAdd(trip.id,newItem.trim(),category);
    setNewItem("");
  };

  useEffect(()=>{
    const loadClimate=async()=>{
      setClimateLoading(true);
      const point=trip.customLocation ? {name:trip.customLocation.name,lat:trip.customLocation.lat,lon:trip.customLocation.lon} : await lookupLocation(siteCfg,trip.location);
      if(!point){setMonthlyClimate([]);setClimateLoading(false);return;}
      setMonthlyClimate(await fetchMonthlyClimateData(point));
      setClimateLoading(false);
    };
    void loadClimate();
  },[trip.id,trip.location,trip.customLocation?.lat,trip.customLocation?.lon,siteCfg.weatherApi.geocodeUrl]);

  return <div className="grid lg:grid-cols-3 gap-6">
    <div className="lg:col-span-2">
      <Card th={th} className="p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">{t("luggage")}</h2>
          <div className="text-right">
            <p className={cx("text-sm",th==="dark"?"text-slate-400":"text-slate-500")}>{packed}/{filteredItems.length} {t("packed")}</p>
            <p className={cx("text-xs",th==="dark"?"text-slate-500":"text-slate-400")}>{packedPct}%</p>
          </div>
        </div>
        <div className={cx("h-2 rounded-full mb-6 overflow-hidden",th==="dark"?"bg-white/8":"bg-slate-200")}>
          <div className="h-full rounded-full bg-cyan-400 transition-all" style={{width:`${packedPct}%`}}/>
        </div>

        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          <button onClick={()=>setCat("all")} className={cx("px-4 py-2 rounded-full font-medium whitespace-nowrap transition",
            cat==="all"?(th==="dark"?"bg-cyan-400 text-slate-950":"bg-slate-800 text-white")
              :(th==="dark"?"bg-white/5 text-slate-400 hover:bg-white/10":"bg-slate-100 text-slate-600 hover:bg-slate-200"))}>
            {t("allCats")}
          </button>
          {cats.map(c=><button key={c.id} onClick={()=>setCat(c.name)} className={cx("px-4 py-2 rounded-full font-medium whitespace-nowrap transition",
            cat===c.name?(th==="dark"?"bg-cyan-400 text-slate-950":"bg-slate-800 text-white")
              :(th==="dark"?"bg-white/5 text-slate-400 hover:bg-white/10":"bg-slate-100 text-slate-600 hover:bg-slate-200"))}>
            {c.name}
          </button>)}
        </div>

        <form onSubmit={add} className="flex gap-2 mb-6">
          <Input th={th} value={newItem} onChange={e=>setNewItem(e.target.value)} placeholder={t("itemName")} className="flex-1"/>
          <Btn th={th} type="submit">+ {t("add")}</Btn>
        </form>

        {filteredItems.length===0?<Empty icon="🧳" title={t("noLuggage")} desc={t("noLuggageDesc")} th={th}/>
        :<div className="space-y-6">
          {groupedItems.map(group=><div key={group.categoryName} className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg">{group.categoryName}</h3>
              <p className={cx("text-sm",th==="dark"?"text-slate-400":"text-slate-500")}>{group.items.filter(item=>item.packed).length}/{group.items.length}</p>
            </div>
            <div className="space-y-2">
              {group.items.map(it=><div key={it.id} className={cx("flex items-center gap-4 rounded-2xl border px-4 py-4 transition",th==="dark"?"border-white/8 bg-white/[0.03] hover:bg-white/[0.06]":"border-slate-200 bg-white/80 hover:bg-white")}>
                <button type="button" onClick={()=>onToggle(trip.id,it.id)} className={cx("flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-sm font-bold transition",it.packed?"border-cyan-400 bg-cyan-400 text-slate-950":(th==="dark"?"border-white/15 text-transparent hover:border-cyan-400":"border-slate-300 text-transparent hover:border-slate-500"))}>✓</button>
                <div className="flex-1 min-w-0">
                  <p className={cx("font-medium",it.packed&&"line-through opacity-50")}>{it.label}</p>
                  <p className={cx("text-xs mt-1",th==="dark"?"text-slate-500":"text-slate-400")}>{it.assignedTo}</p>
                </div>
                <button type="button" onClick={()=>onRemove(trip.id,it.id)} className="text-rose-400 opacity-70 hover:opacity-100">✕</button>
              </div>)}
            </div>
          </div>)}
        </div>}
      </Card>
    </div>

    <Card th={th} className="p-6 space-y-4">
      <h3 className="text-xl font-bold mb-4">{t("monthlyClimate")}</h3>
      {tripMonths.size>0&&<div className="mb-4 flex flex-wrap gap-2">{Array.from(tripMonths).sort((a,b)=>a-b).map(monthIndex=><Badge key={monthIndex} label={monthLabel(monthIndex)} th={th} color="amber"/>)}</div>}
      {climateLoading?<p className={cx("text-sm",th==="dark"?"text-slate-400":"text-slate-500")}>{t("loading")}</p>
      :!monthlyClimate||monthlyClimate.length===0?<p className={cx("text-sm",th==="dark"?"text-slate-400":"text-slate-500")}>{t("noData")}</p>
      :<>
        <div className="grid grid-cols-3 gap-3 mb-4">
          {(() => {
            const tripMonthData = monthlyClimate.filter((_, index) => tripMonths.has(index));
            const focus = tripMonthData.length > 0 ? tripMonthData : monthlyClimate;
            const warmest = [...focus].sort((a,b)=>b.avgHigh-a.avgHigh)[0];
            const coolest = [...focus].sort((a,b)=>a.avgLow-b.avgLow)[0];
            const driest = [...focus].sort((a,b)=>a.avgRain-b.avgRain)[0];
            return [
              { label: t("avgHigh"), value: warmest ? `${warmest.month} ${Math.round(warmest.avgHigh)}°C` : "—", color: th==="dark"?"bg-orange-400/10 text-orange-200":"bg-orange-50 text-orange-700" },
              { label: t("avgLow"), value: coolest ? `${coolest.month} ${Math.round(coolest.avgLow)}°C` : "—", color: th==="dark"?"bg-cyan-400/10 text-cyan-200":"bg-cyan-50 text-cyan-700" },
              { label: t("avgRain"), value: driest ? `${driest.month} ${driest.avgRain.toFixed(1)} mm` : "—", color: th==="dark"?"bg-emerald-400/10 text-emerald-200":"bg-emerald-50 text-emerald-700" },
            ].map(card=><div key={card.label} className={cx("rounded-2xl p-4",card.color)}>
              <p className="text-xs uppercase tracking-[0.16em] opacity-75">{card.label}</p>
              <p className="mt-2 text-sm font-semibold leading-6">{card.value}</p>
            </div>);
          })()}
        </div>
        <div className="grid gap-3">
          {monthlyClimate.map((mc,index)=>{
            const highlight=tripMonths.has(index);
            const weatherTone = mc.avgHigh >= 28 ? t("warm") : mc.avgHigh <= 16 ? t("cool") : t("mild");
            const rainTone = mc.avgRain >= 4 ? t("wetter") : mc.avgRain <= 1.5 ? t("drier") : t("balanced");
            return <div key={mc.month} className={cx("rounded-3xl border p-4",highlight?(th==="dark"?"border-amber-400/40 bg-amber-400/10":"border-amber-300 bg-amber-50"):(th==="dark"?"border-white/8 bg-white/[0.03]":"border-slate-200 bg-slate-50"))}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <p className="text-lg font-semibold">{mc.month}</p>
                  {highlight&&<Badge label={t("tripMonths")} th={th} color="amber"/>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className={cx("rounded-full px-3 py-1 text-xs font-semibold",th==="dark"?"bg-white/8 text-slate-200":"bg-white text-slate-700")}>{weatherTone}</span>
                  <span className={cx("rounded-full px-3 py-1 text-xs font-semibold",th==="dark"?"bg-white/8 text-slate-200":"bg-white text-slate-700")}>{rainTone}</span>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                <div className={cx("rounded-2xl p-3",th==="dark"?"bg-white/[0.04]":"bg-white")}>
                  <p className={cx("text-xs uppercase tracking-[0.16em]",th==="dark"?"text-slate-400":"text-slate-500")}>{t("avgHigh")}</p>
                  <p className="mt-2 text-lg font-bold">{Math.round(mc.avgHigh)}°C</p>
                </div>
                <div className={cx("rounded-2xl p-3",th==="dark"?"bg-white/[0.04]":"bg-white")}>
                  <p className={cx("text-xs uppercase tracking-[0.16em]",th==="dark"?"text-slate-400":"text-slate-500")}>{t("avgLow")}</p>
                  <p className="mt-2 text-lg font-bold">{Math.round(mc.avgLow)}°C</p>
                </div>
                <div className={cx("rounded-2xl p-3",th==="dark"?"bg-white/[0.04]":"bg-white")}>
                  <p className={cx("text-xs uppercase tracking-[0.16em]",th==="dark"?"text-slate-400":"text-slate-500")}>{t("avgRain")}</p>
                  <p className="mt-2 text-lg font-bold">{mc.avgRain.toFixed(1)} mm</p>
                </div>
              </div>
            </div>;
          })}
        </div>
      </>}
    </Card>
  </div>;
}

function TripSettings({trip,isOwner,siteCfg,th,t,onUpdate}:{trip:Trip;isOwner:boolean;siteCfg:SiteSettings;th:ThemeMode;t:(k:TKey)=>string;onUpdate:(id:string,d:Partial<Trip>)=>void}){
  const [form,setForm]=useState(()=>({...trip,bannerImageUrl:""}));
  const [saved,setSaved]=useState(false);
  const [flightMessage,setFlightMessage]=useState("");
  const [hotelMessage,setHotelMessage]=useState("");
  const [flightSearchingId,setFlightSearchingId]=useState<string|null>(null);
  const [hotelSearchingId,setHotelSearchingId]=useState<string|null>(null);
  const [quickFlightNumber,setQuickFlightNumber]=useState("");
  const [quickHotelQuery,setQuickHotelQuery]=useState("");

  useEffect(()=>{ setForm({...trip,bannerImageUrl:""}); },[trip]);

  const save=()=>{
    const shouldKeepCustom=Boolean(form.customLocation?.name?.trim()) && Number.isFinite(form.customLocation?.lat) && Number.isFinite(form.customLocation?.lon) && !(form.customLocation?.lat===0 && form.customLocation?.lon===0 && !form.customLocation?.name.trim());
    const firstLeg=form.flightLegs[0];
    const firstHotel=form.hotels[0];
    const itineraryWithFlights=addFlightLegsToItinerary(form.itinerary,form.flightLegs,form.startDate);
    onUpdate(trip.id,{
      ...form,
      itinerary: itineraryWithFlights,
      customLocation:shouldKeepCustom?form.customLocation:undefined,
      airline:firstLeg?.airline??"", flightNumber:firstLeg?.flightNumber??"", departureAirport:firstLeg?.departureAirport??"", arrivalAirport:firstLeg?.arrivalAirport??"",
      departureTime:firstLeg?.departureTime??"", arrivalTime:firstLeg?.arrivalTime??"", terminal:firstLeg?.terminal??"", bookingReference:firstLeg?.bookingReference??"",
      hotelName:firstHotel?.hotelName??"", hotelAddress:firstHotel?.hotelAddress??"", roomType:firstHotel?.roomType??"", checkIn:firstHotel?.checkIn??"", checkOut:firstHotel?.checkOut??"", confirmationCode:firstHotel?.confirmationCode??"",
    });
    setSaved(true);
    setTimeout(()=>setSaved(false),2000);
  };

  const handleBannerUpload=async(e:ChangeEvent<HTMLInputElement>)=>{
    const file=e.target.files?.[0];if(!file)return;
    const url=await readFile(file);
    setForm(f=>({...f,bannerImage:url}));
  };

  const setBannerUrl=()=>{
    if(form.bannerImageUrl.trim()){
      setForm(f=>({...f,bannerImage:f.bannerImageUrl.trim(),bannerImageUrl:""}));
    }
  };

  const updateLeg=(legId:string,patch:Partial<FlightLeg>)=>setForm(f=>({...f,flightLegs:f.flightLegs.map(leg=>leg.id===legId?{...leg,...patch}:leg)}));
  const addLeg=async()=>{
    const leg={id:uid("flt"),airline:"",flightNumber:quickFlightNumber.trim(),departureAirport:"",arrivalAirport:"",departureTime:"",arrivalTime:"",terminal:"",bookingReference:"",notes:""};
    setForm(f=>({...f,flightLegs:[...f.flightLegs,leg]}));
    if(!quickFlightNumber.trim())return;
    setFlightSearchingId(leg.id);
    try{
      const suggestion=await searchFlightByNumber(siteCfg,quickFlightNumber);
      if(!suggestion){setFlightMessage(t("autoFillNoMatch"));return;}
      updateLeg(leg.id,{...suggestion,flightNumber:quickFlightNumber.trim()});
      setFlightMessage(t("flightAutoFilled"));
    }finally{setFlightSearchingId(null);}
  };
  const removeLeg=(legId:string)=>setForm(f=>({...f,flightLegs:f.flightLegs.filter(leg=>leg.id!==legId)}));
  const updateHotel=(hotelId:string,patch:Partial<HotelStay>)=>setForm(f=>({...f,hotels:f.hotels.map(hotel=>hotel.id===hotelId?{...hotel,...patch}:hotel)}));
  const addHotel=()=>setForm(f=>({...f,hotels:[...f.hotels,{id:uid("htl"),hotelName:"",hotelAddress:"",roomType:"",checkIn:"",checkOut:"",confirmationCode:"",contact:"",notes:""}]}));
  const removeHotel=(hotelId:string)=>setForm(f=>({...f,hotels:f.hotels.filter(hotel=>hotel.id!==hotelId)}));

  const ensureFirstLeg=()=>{
    if(form.flightLegs.length>0)return form.flightLegs[0];
    const created={id:uid("flt"),airline:"",flightNumber:quickFlightNumber.trim(),departureAirport:"",arrivalAirport:"",departureTime:"",arrivalTime:"",terminal:"",bookingReference:"",notes:""};
    setForm(f=>({...f,flightLegs:[created,...f.flightLegs]}));
    return created;
  };

  const ensureFirstHotel=()=>{
    if(form.hotels.length>0)return form.hotels[0];
    const created={id:uid("htl"),hotelName:"",hotelAddress:"",roomType:"",checkIn:"",checkOut:"",confirmationCode:"",contact:"",notes:""};
    setForm(f=>({...f,hotels:[created,...f.hotels]}));
    return created;
  };

  const quickSearchFlight=async()=>{
    if(!quickFlightNumber.trim()){setFlightMessage(t("flightNumberRequired"));return;}
    const target=form.flightLegs.length>0?form.flightLegs[form.flightLegs.length-1]:ensureFirstLeg();
    setFlightSearchingId(target.id);
    try{
      const suggestion=await searchFlightByNumber(siteCfg,quickFlightNumber);
      if(!suggestion){setFlightMessage(t("autoFillNoMatch"));return;}
      updateLeg(target.id,{...suggestion,flightNumber:quickFlightNumber.trim()});
      setFlightMessage(t("flightAutoFilled"));
    }finally{setFlightSearchingId(null);}
  };

  const quickSearchHotel=async()=>{
    if(!quickHotelQuery.trim()&&!trip.location.trim()){setHotelMessage(t("hotelSearchHint"));return;}
    const target=ensureFirstHotel();
    setHotelSearchingId(target.id);
    try{
      const baseName=quickHotelQuery.trim()||target.hotelName;
      const suggestion=await searchHotelByQuery(siteCfg,baseName,trip.location);
      if(!suggestion){setHotelMessage(t("autoFillNoMatch"));return;}
      updateHotel(target.id,{hotelName:suggestion.hotelName||baseName,hotelAddress:suggestion.hotelAddress||target.hotelAddress,roomType:suggestion.roomType||target.roomType,contact:suggestion.contact||target.contact});
      setHotelMessage(t("hotelAutoFilled"));
    }finally{setHotelSearchingId(null);}
  };

  const autofillFlight=async(leg:FlightLeg)=>{
    if(!leg.flightNumber.trim()){setFlightMessage(t("flightNumberRequired"));return;}
    setFlightSearchingId(leg.id);
    try{
      const suggestion=await searchFlightByNumber(siteCfg,leg.flightNumber);
      if(!suggestion){setFlightMessage(t("autoFillNoMatch"));return;}
      updateLeg(leg.id,suggestion);
      setFlightMessage(t("flightAutoFilled"));
    }finally{setFlightSearchingId(null);}
  };

  const autofillHotel=async(hotel:HotelStay)=>{
    if(!hotel.hotelName.trim()&&!trip.location.trim()){setHotelMessage(t("hotelSearchHint"));return;}
    setHotelSearchingId(hotel.id);
    try{
      const suggestion=await searchHotelByQuery(siteCfg,hotel.hotelName,trip.location);
      if(!suggestion){setHotelMessage(t("autoFillNoMatch"));return;}
      updateHotel(hotel.id,{ hotelName:suggestion.hotelName||hotel.hotelName, hotelAddress:suggestion.hotelAddress||hotel.hotelAddress, roomType:suggestion.roomType||hotel.roomType, contact:suggestion.contact||hotel.contact });
      setHotelMessage(t("hotelAutoFilled"));
    }finally{setHotelSearchingId(null);}
  };

  if(!isOwner){
    return <Card th={th} className="p-8 text-center">
      <p className={cx("text-lg",th==="dark"?"text-slate-400":"text-slate-500")}>
        ⚙️ {t("settings")} — {t("owner")} only
      </p>
    </Card>;
  }

  return <Card th={th} className="p-8 space-y-6">
    <h2 className="text-2xl font-bold">{t("tripDetails")}</h2>
    <Card th={th} className="p-6 space-y-4">
      <h3 className="text-xl font-semibold">{t("quickSearch")}</h3>
      <div className="grid lg:grid-cols-2 gap-4">
        <div className={cx("rounded-2xl p-4 space-y-3",th==="dark"?"bg-white/[0.03]":"bg-slate-50")}>
          <p className={cx("text-sm font-medium",th==="dark"?"text-slate-300":"text-slate-700")}>{t("quickFlightSearch")}</p>
          <div className="flex gap-2">
            <Input th={th} value={quickFlightNumber} onChange={e=>setQuickFlightNumber(e.target.value)} placeholder={t("flightNumber")} className="flex-1"/>
            <Btn th={th} v="sec" sz="sm" type="button" onClick={()=>void quickSearchFlight()} disabled={Boolean(flightSearchingId)}>{flightSearchingId?t("loading"):t("search")}</Btn>
          </div>
        </div>
        <div className={cx("rounded-2xl p-4 space-y-3",th==="dark"?"bg-white/[0.03]":"bg-slate-50")}>
          <p className={cx("text-sm font-medium",th==="dark"?"text-slate-300":"text-slate-700")}>{t("quickHotelSearch")}</p>
          <div className="flex gap-2">
            <Input th={th} value={quickHotelQuery} onChange={e=>setQuickHotelQuery(e.target.value)} placeholder={t("hotelName")} className="flex-1"/>
            <Btn th={th} v="sec" sz="sm" type="button" onClick={()=>void quickSearchHotel()} disabled={Boolean(hotelSearchingId)}>{hotelSearchingId?t("loading"):t("search")}</Btn>
          </div>
        </div>
      </div>
    </Card>
    <div className="space-y-6">
      <Card th={th} className="p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xl font-semibold">{t("flightLegs")}</h3>
          <Btn th={th} v="sec" type="button" onClick={()=>void addLeg()}>+ {t("addLeg")}</Btn>
        </div>
        {form.flightLegs.length===0&&<p className={cx("text-sm",th==="dark"?"text-slate-400":"text-slate-500")}>{t("noFlightDetails")}</p>}
        <p className={cx("text-xs",th==="dark"?"text-slate-400":"text-slate-500")}>{t("flightSearchByNumberHint")}</p>
        {flightMessage&&<p className={cx("text-sm",th==="dark"?"text-cyan-300":"text-blue-700")}>{flightMessage}</p>}
        <div className="space-y-4">
          {form.flightLegs.map((leg,index)=><div key={leg.id} className={cx("rounded-3xl border p-5 space-y-4",th==="dark"?"border-white/8 bg-white/[0.03]":"border-slate-200 bg-slate-50")}>
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="font-semibold">{t("flightDetails")} {index+1}</p>
                <p className={cx("text-xs",th==="dark"?"text-slate-400":"text-slate-500")}>{t("autoSearchFlight")}</p>
              </div>
              <div className="flex items-center gap-2">
                <Btn th={th} v="sec" sz="sm" type="button" onClick={()=>void autofillFlight(leg)} disabled={flightSearchingId===leg.id}>{flightSearchingId===leg.id?t("loading"):t("search")}</Btn>
                <Btn th={th} v="danger" sz="sm" type="button" onClick={()=>removeLeg(leg.id)}>{t("remove")}</Btn>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <Input th={th} label={t("airline")} value={leg.airline} onChange={e=>updateLeg(leg.id,{airline:e.target.value})}/>
              <Input th={th} label={t("flightNumber")} value={leg.flightNumber} onChange={e=>updateLeg(leg.id,{flightNumber:e.target.value})} onBlur={()=>void autofillFlight(leg)}/>
              <Input th={th} label={t("departureAirport")} value={leg.departureAirport} onChange={e=>updateLeg(leg.id,{departureAirport:e.target.value})}/>
              <Input th={th} label={t("arrivalAirport")} value={leg.arrivalAirport} onChange={e=>updateLeg(leg.id,{arrivalAirport:e.target.value})}/>
              <Input th={th} label={t("departureDate")} type="date" value={toDateInput(leg.departureTime)} onChange={e=>updateLeg(leg.id,{departureTime:combineDateTime(e.target.value,toTimeInput(leg.departureTime))})}/>
              <Input th={th} label={t("departureTime")} type="time" value={toTimeInput(leg.departureTime)} onChange={e=>updateLeg(leg.id,{departureTime:combineDateTime(toDateInput(leg.departureTime),e.target.value)})}/>
              <Input th={th} label={t("arrivalDate")} type="date" value={toDateInput(leg.arrivalTime)} onChange={e=>updateLeg(leg.id,{arrivalTime:combineDateTime(e.target.value,toTimeInput(leg.arrivalTime))})}/>
              <Input th={th} label={t("arrivalTime")} type="time" value={toTimeInput(leg.arrivalTime)} onChange={e=>updateLeg(leg.id,{arrivalTime:combineDateTime(toDateInput(leg.arrivalTime),e.target.value)})}/>
              <Input th={th} label={t("terminal")} value={leg.terminal} onChange={e=>updateLeg(leg.id,{terminal:e.target.value})}/>
              <Input th={th} label={t("bookingReference")} value={leg.bookingReference} onChange={e=>updateLeg(leg.id,{bookingReference:e.target.value})}/>
            </div>
            <Textarea th={th} label={t("legNotes")} className="min-h-16" value={leg.notes} onChange={e=>updateLeg(leg.id,{notes:e.target.value})}/>
          </div>)}
        </div>
      </Card>

      <Card th={th} className="p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xl font-semibold">{t("hotelStays")}</h3>
          <Btn th={th} v="sec" type="button" onClick={addHotel}>+ {t("addHotel")}</Btn>
        </div>
        {form.hotels.length===0&&<p className={cx("text-sm",th==="dark"?"text-slate-400":"text-slate-500")}>{t("noHotelDetails")}</p>}
        <p className={cx("text-xs",th==="dark"?"text-slate-400":"text-slate-500")}>{t("hotelSearchHint")}</p>
        {hotelMessage&&<p className={cx("text-sm",th==="dark"?"text-cyan-300":"text-blue-700")}>{hotelMessage}</p>}
        <div className="space-y-4">
          {form.hotels.map((hotel,index)=><div key={hotel.id} className={cx("rounded-3xl border p-5 space-y-4",th==="dark"?"border-white/8 bg-white/[0.03]":"border-slate-200 bg-slate-50")}>
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="font-semibold">{t("hotelDetails")} {index+1}</p>
                <p className={cx("text-xs",th==="dark"?"text-slate-400":"text-slate-500")}>{t("autoFillHotel")}</p>
              </div>
              <div className="flex items-center gap-2">
                <Btn th={th} v="sec" sz="sm" type="button" onClick={()=>void autofillHotel(hotel)} disabled={hotelSearchingId===hotel.id}>{hotelSearchingId===hotel.id?t("loading"):t("search")}</Btn>
                <Btn th={th} v="danger" sz="sm" type="button" onClick={()=>removeHotel(hotel.id)}>{t("remove")}</Btn>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <Input th={th} label={t("hotelName")} value={hotel.hotelName} onChange={e=>updateHotel(hotel.id,{hotelName:e.target.value})}/>
              <Input th={th} label={t("roomType")} value={hotel.roomType} onChange={e=>updateHotel(hotel.id,{roomType:e.target.value})}/>
              <Input th={th} label={t("checkIn")} type="date" value={hotel.checkIn} onChange={e=>updateHotel(hotel.id,{checkIn:e.target.value})}/>
              <Input th={th} label={t("checkOut")} type="date" value={hotel.checkOut} onChange={e=>updateHotel(hotel.id,{checkOut:e.target.value})}/>
              <Input th={th} label={t("confirmationCode")} value={hotel.confirmationCode} onChange={e=>updateHotel(hotel.id,{confirmationCode:e.target.value})}/>
              <Input th={th} label={t("propertyContact")} value={hotel.contact} onChange={e=>updateHotel(hotel.id,{contact:e.target.value})}/>
            </div>
            <Textarea th={th} label={t("hotelAddress")} value={hotel.hotelAddress} onChange={e=>updateHotel(hotel.id,{hotelAddress:e.target.value})}/>
            <Textarea th={th} label={t("stayNotes")} value={hotel.notes} onChange={e=>updateHotel(hotel.id,{notes:e.target.value})}/>
          </div>)}
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card th={th} className="p-6 space-y-4">
          <Textarea th={th} label={t("generalNotes")} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/>
        </Card>

        <Card th={th} className="p-6 space-y-4">
          <h3 className="text-xl font-semibold">{t("weatherLocationSettings")}</h3>
          <div className="grid sm:grid-cols-3 gap-3">
            <Input th={th} label={t("locationName")} value={form.customLocation?.name||""} onChange={e=>setForm(f=>({...f,customLocation:{name:e.target.value,lat:f.customLocation?.lat||0,lon:f.customLocation?.lon||0}}))}/>
            <Input th={th} label={t("latitude")} type="number" step="any" value={form.customLocation?.lat||""} onChange={e=>setForm(f=>({...f,customLocation:{name:f.customLocation?.name||form.location,lat:+e.target.value,lon:f.customLocation?.lon||0}}))}/>
            <Input th={th} label={t("longitude")} type="number" step="any" value={form.customLocation?.lon||""} onChange={e=>setForm(f=>({...f,customLocation:{name:f.customLocation?.name||form.location,lat:f.customLocation?.lat||0,lon:+e.target.value}}))}/>
          </div>
          <div className="flex gap-2">
            <Btn th={th} v="sec" type="button" onClick={()=>setForm(f=>({...f,customLocation:undefined}))}>{t("useDestination")}</Btn>
            <Btn th={th} v="ghost" type="button" onClick={()=>setForm(f=>({...f,customLocation:{name:"",lat:0,lon:0}}))}>{t("remove")}</Btn>
          </div>
        </Card>
      </div>
    </div>

    <div>
      <label className="block mb-2">{t("bannerColor")}</label>
      <input type="color" value={form.bannerColor} onChange={e=>setForm(f=>({...f,bannerColor:e.target.value}))}
        className={cx("w-full h-12 rounded-2xl border cursor-pointer",th==="dark"?"border-white/10":"border-slate-300")}/>
    </div>

    <div>
      <p className="mb-2 font-medium">{t("bannerImage")}</p>
      {form.bannerImage&&<div className="mb-3 relative">
        <img src={form.bannerImage} alt="Banner" className="w-full h-40 object-cover rounded-2xl"/>
        <button onClick={()=>setForm(f=>({...f,bannerImage:""}))} className="absolute top-2 right-2 px-3 py-1 rounded-full bg-rose-500 text-white text-sm font-medium">
          {t("removeBanner")}
        </button>
      </div>}
      <div className="space-y-3">
        <label className={cx("flex items-center gap-2 px-4 py-3 rounded-2xl border cursor-pointer transition",
          th==="dark"?"border-white/10 bg-white/5 hover:bg-white/10":"border-slate-300 bg-white hover:bg-slate-50")}>
          📤 {t("uploadBanner")}<input type="file" accept="image/*" className="hidden" onChange={handleBannerUpload}/>
        </label>
        <div className="flex gap-2">
          <Input th={th} value={form.bannerImageUrl} onChange={e=>setForm(f=>({...f,bannerImageUrl:e.target.value}))} placeholder={t("bannerUrl")} className="flex-1"/>
          <Btn th={th} v="sec" onClick={setBannerUrl}>{t("add")}</Btn>
        </div>
      </div>
    </div>

    <div className="flex gap-2 items-center">
      <Btn th={th} onClick={save}>{t("save")}</Btn>
      {saved&&<span className="text-emerald-400 font-medium">✓ {t("saved")}</span>}
    </div>
  </Card>;
}

/* ═══════════════════════════════════════════════════════════════════════════════
   ADMIN
   ═══════════════════════════════════════════════════════════════════════════════ */
function AdminWorkspace({profiles,trips,th,t,adminPw,adminAuth,setAdminPw,setAdminAuth,siteCfg,setSiteCfg,onDeleteTrip,onDeleteTraveler,onRefreshSync}:{
  profiles:Profile[];trips:Trip[];th:ThemeMode;t:(k:TKey)=>string;
  adminPw:string;adminAuth:boolean;setAdminPw:(v:string)=>void;setAdminAuth:(v:boolean)=>void;
  siteCfg:SiteSettings;setSiteCfg:(v:SiteSettings)=>void;
  onDeleteTrip:(id:string)=>void;onDeleteTraveler:(id:string)=>void;
  onRefreshSync?:()=>Promise<void>|void;
}){
  const [tab,setTab]=useState<AdminTab>("trips");
  const [loginPw,setLoginPw]=useState("");
  const [setupPw,setSetupPw]=useState("");
  const [err,setErr]=useState("");

  if(!adminPw){
    return <div className="max-w-md mx-auto px-5 py-20">
      <Card th={th} className="p-8 text-center space-y-4">
        <h2 className="text-2xl font-bold">🔐 {t("adminSetup")}</h2>
        <Input th={th} type="password" value={setupPw} onChange={e=>setSetupPw(e.target.value)} placeholder={t("newPassword")}/>
        <Btn th={th} onClick={()=>{if(setupPw.trim()){setAdminPw(setupPw);setAdminAuth(true);}}}>{t("setPassword")}</Btn>
      </Card>
    </div>;
  }

  if(!adminAuth){
    return <div className="max-w-md mx-auto px-5 py-20">
      <Card th={th} className="p-8 text-center space-y-4">
        <h2 className="text-2xl font-bold">🔐 {t("adminLogin")}</h2>
        <Input th={th} type="password" value={loginPw} onChange={e=>setLoginPw(e.target.value)} placeholder={t("password")}
          onKeyDown={e=>{if(e.key==="Enter"){if(loginPw===adminPw){setAdminAuth(true);}else setErr("Wrong password.");}}}/>
        {err&&<p className="text-rose-400">{err}</p>}
        <Btn th={th} onClick={()=>{if(loginPw===adminPw){setAdminAuth(true);}else setErr("Wrong password.");}}>{t("signIn")}</Btn>
      </Card>
    </div>;
  }

  const adminTabs:{id:AdminTab;label:string;icon:string}[]=[
    {id:"trips",label:t("adminTrips"),icon:"✈️"},{id:"travelers",label:t("adminTravelers"),icon:"👥"},
    {id:"luggage",label:t("adminLuggage"),icon:"🧳"},{id:"website",label:t("adminWebsite"),icon:"🌐"},
    {id:"password",label:t("adminPassword"),icon:"🔑"},
  ];

  return <div className="max-w-5xl mx-auto px-5 py-6 space-y-6">
    <div className="flex items-center justify-between">
      <h1 className="text-3xl font-bold">{t("admin")}</h1>
      <Btn th={th} v="ghost" sz="sm" onClick={()=>setAdminAuth(false)}>{t("signOut")}</Btn>
    </div>
    <Tabs tabs={adminTabs} active={tab} onChange={setTab} th={th}/>

    {tab==="trips"&&<AdminTrips trips={trips} th={th} t={t} onDelete={onDeleteTrip}/>}
    {tab==="travelers"&&<AdminTravelers profiles={profiles} trips={trips} th={th} t={t} onDelete={onDeleteTraveler}/>}
    {tab==="luggage"&&<AdminLuggageCfg th={th} t={t} settings={siteCfg} onSave={setSiteCfg}/>}
    {tab==="website"&&<div className="space-y-6">
      <AdminWebsite th={th} t={t} settings={siteCfg} onSave={setSiteCfg}/>
      <AdminCloudSyncConfig th={th} onSaved={onRefreshSync}/>
    </div>}
    {tab==="password"&&<AdminPasswordForm th={th} t={t} onSave={setAdminPw}/>}
  </div>;
}

function AdminTrips({trips,th,t,onDelete}:{trips:Trip[];th:ThemeMode;t:(k:TKey)=>string;onDelete:(id:string)=>void}){
  return <div className="space-y-3">
    <p className={cx(th==="dark"?"text-slate-400":"text-slate-500")}>{trips.length} {t("adminTrips")}</p>
    {trips.length===0?<Empty icon="✈️" title={t("noTrips")} desc="" th={th}/>
    :trips.map(tr=><Card key={tr.id} th={th} className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-semibold text-lg">{tr.title}</p>
          <p className={cx("text-sm",th==="dark"?"text-slate-400":"text-slate-500")}>
            {tr.location} · {fmtDate(tr.startDate)} – {fmtDate(tr.endDate)} · {tr.members.length} {t("members")}
          </p>
          <p className={cx("text-sm mt-0.5",th==="dark"?"text-slate-500":"text-slate-400")}>ID: {tr.id} · {t("owner")}: {tr.ownerName}</p>
        </div>
        <Btn th={th} v="danger" sz="sm" onClick={()=>onDelete(tr.id)}>{t("delete")}</Btn>
      </div>
    </Card>)}
  </div>;
}

function AdminTravelers({profiles,trips,th,t,onDelete}:{profiles:Profile[];trips:Trip[];th:ThemeMode;t:(k:TKey)=>string;onDelete:(id:string)=>void}){
  return <div className="space-y-3">
    <p className={cx(th==="dark"?"text-slate-400":"text-slate-500")}>{profiles.length} {t("adminTravelers")}</p>
    {profiles.length===0?<Empty icon="👥" title={t("noData")} desc="" th={th}/>
    :profiles.map(p=>{
      const joined=trips.filter(tr=>tr.members.includes(p.id)).length;
      return <Card key={p.id} th={th} className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-3">
            <Avatar name={dn(p)} th={th}/>
            <div>
              <p className="font-semibold text-lg">{dn(p)}</p>
              <p className={cx("text-sm",th==="dark"?"text-slate-400":"text-slate-500")}>@{p.accountName} · {p.email} · {p.phone}</p>
              <p className={cx("text-sm",th==="dark"?"text-slate-500":"text-slate-400")}>{joined} {t("adminTrips")}</p>
            </div>
          </div>
          <Btn th={th} v="danger" sz="sm" onClick={()=>onDelete(p.id)}>{t("remove")}</Btn>
        </div>
      </Card>;
    })}
  </div>;
}

function AdminLuggageCfg({th,t,settings,onSave}:{th:ThemeMode;t:(k:TKey)=>string;settings:SiteSettings;onSave:(s:SiteSettings)=>void}){
  const safeCats=Array.isArray(settings?.luggageCategories)?settings.luggageCategories:defaultLuggageCats;
  const [cats,setCats]=useState<LuggageCategory[]>(safeCats.map(c=>({...c,defaultItems:[...c.defaultItems]})));
  const [newCat,setNewCat]=useState("");
  const [saved,setSaved]=useState(false);
  const [newItemVals,setNewItemVals]=useState<Record<string,string>>({});

  const addCat=()=>{if(!newCat.trim())return;setCats(c=>[...c,{id:uid("cat"),name:newCat.trim(),defaultItems:[]}]);setNewCat("");};
  const remCat=(id:string)=>setCats(c=>c.filter(x=>x.id!==id));
  const addItem=(catId:string)=>{
    const val=newItemVals[catId]?.trim();if(!val)return;
    setCats(c=>c.map(x=>x.id===catId?{...x,defaultItems:[...x.defaultItems,val]}:x));
    setNewItemVals(v=>({...v,[catId]:""}));
  };
  const remItem=(catId:string,item:string)=>setCats(c=>c.map(x=>x.id===catId?{...x,defaultItems:x.defaultItems.filter(i=>i!==item)}:x));
  const save=()=>{onSave({...settings,luggageCategories:cats});setSaved(true);setTimeout(()=>setSaved(false),2000);};

  return <div className="space-y-4">
    <div className={cx("rounded-2xl p-5 border",th==="dark"?"border-cyan-400/20 bg-cyan-400/5 text-cyan-300":"border-blue-200 bg-blue-50 text-blue-800")}>
      💡 {t("luggageCfgHelp")}
    </div>

    {cats.map(cat=><Card key={cat.id} th={th} className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-lg">{cat.name}</h3>
        <Btn th={th} v="danger" sz="sm" onClick={()=>remCat(cat.id)}>{t("removeCategory")}</Btn>
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        {cat.defaultItems.map(item=><span key={item} className={cx("flex items-center gap-2 rounded-full px-4 py-2",
          th==="dark"?"bg-white/8 text-slate-300":"bg-slate-100 text-slate-700")}>
          {item}<button onClick={()=>remItem(cat.id,item)} className="opacity-60 hover:opacity-100">✕</button>
        </span>)}
      </div>
      <form onSubmit={e=>{e.preventDefault();addItem(cat.id);}} className="flex gap-2">
        <Input th={th} value={newItemVals[cat.id]||""} onChange={e=>setNewItemVals(v=>({...v,[cat.id]:e.target.value}))} placeholder={t("addDefaultItem")} className="flex-1"/>
        <Btn th={th} v="sec" sz="sm" type="submit">+ {t("add")}</Btn>
      </form>
    </Card>)}

    <div className="flex gap-2">
      <Input th={th} value={newCat} onChange={e=>setNewCat(e.target.value)} placeholder={t("categoryName")} className="flex-1"
        onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();addCat();}}}/>
      <Btn th={th} v="sec" onClick={addCat}>+ {t("addCategory")}</Btn>
    </div>

    <div className="flex gap-2 items-center">
      <Btn th={th} onClick={save}>{t("saveLuggageCfg")}</Btn>
      {saved&&<span className="text-emerald-400 font-medium">✓ {t("saved")}</span>}
    </div>
  </div>;
}

function AdminWebsite({th,t,settings,onSave}:{th:ThemeMode;t:(k:TKey)=>string;settings:SiteSettings;onSave:(s:SiteSettings)=>void}){
  const [form,setForm]=useState({...settings});
  const [saved,setSaved]=useState(false);
  const submit=(e:React.FormEvent)=>{e.preventDefault();onSave(form);setSaved(true);setTimeout(()=>setSaved(false),2000);};

  return <form onSubmit={submit} className="space-y-5">
    <Card th={th} className="p-6 space-y-4">
      <h3 className="font-semibold text-xl">{t("adminWebsite")}</h3>
      <Input th={th} label={t("websiteName")} value={form.siteName} onChange={e=>setForm(f=>({...f,siteName:e.target.value}))}/>
      <Textarea th={th} label={t("websiteDesc")} value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))}/>
    </Card>
    <Card th={th} className="p-6 space-y-4">
      <h3 className="font-semibold text-xl">🌤️ {t("weatherApi")}</h3>
      <div className={cx("rounded-2xl p-5 border space-y-2 leading-relaxed",th==="dark"?"border-cyan-400/20 bg-cyan-400/5 text-cyan-300":"border-blue-200 bg-blue-50 text-blue-800")}>
        <p>1. {t("apiHelp1")}</p><p>2. {t("apiHelp2")}</p><p>3. {t("apiHelp3")}</p>
      </div>
      <Input th={th} label={t("providerName")} value={form.weatherApi.providerName} onChange={e=>setForm(f=>({...f,weatherApi:{...f.weatherApi,providerName:e.target.value}}))}/>
      <Input th={th} label={t("geocodeUrl")} value={form.weatherApi.geocodeUrl} onChange={e=>setForm(f=>({...f,weatherApi:{...f.weatherApi,geocodeUrl:e.target.value}}))}/>
      <Input th={th} label={t("forecastUrl")} value={form.weatherApi.forecastUrl} onChange={e=>setForm(f=>({...f,weatherApi:{...f.weatherApi,forecastUrl:e.target.value}}))}/>
    </Card>

    <Card th={th} className="p-6 space-y-4">
      <h3 className="font-semibold text-xl">🔎 {t("lookupApi")}</h3>
      <div className={cx("rounded-2xl p-5 border space-y-2 leading-relaxed",th==="dark"?"border-cyan-400/20 bg-cyan-400/5 text-cyan-300":"border-blue-200 bg-blue-50 text-blue-800")}>
        <p>4. {t("apiHelp4")}</p><p>5. {t("apiHelp5")}</p><p>6. {t("apiHelp6")}</p>
      </div>
      <Input th={th} label={t("flightLookupUrl")} value={form.weatherApi.flightLookupUrl} onChange={e=>setForm(f=>({...f,weatherApi:{...f.weatherApi,flightLookupUrl:e.target.value}}))}/>
      <Input th={th} label={t("hotelLookupUrl")} value={form.weatherApi.hotelLookupUrl} onChange={e=>setForm(f=>({...f,weatherApi:{...f.weatherApi,hotelLookupUrl:e.target.value}}))}/>
    </Card>
    <div className="flex gap-2 items-center">
      <Btn th={th} type="submit">{t("save")}</Btn>
      <Btn th={th} v="sec" type="button" onClick={()=>setForm({...defaultSiteSettings})}>{t("resetDefaults")}</Btn>
      {saved&&<span className="text-emerald-400 font-medium">✓ {t("saved")}</span>}
    </div>
  </form>;
}

function AdminCloudSyncConfig({th,onSaved}:{th:ThemeMode;onSaved?:()=>Promise<void>|void}){
  const initial = useMemo(()=>getCloudD1Config(),[]);
  const [workerEndpoint,setWorkerEndpoint] = useState(()=>getCloudWorkerEndpoint());
  const [accountId,setAccountId] = useState(initial.accountId);
  const [databaseId,setDatabaseId] = useState(initial.databaseId);
  const [apiToken,setApiToken] = useState(initial.apiToken);
  const [busy,setBusy] = useState(false);
  const [testing,setTesting] = useState(false);
  const [d1Testing,setD1Testing] = useState(false);
  const [msg,setMsg] = useState("");
  const [err,setErr] = useState("");

  const fillFromStored = ()=>{
    const existing = getCloudD1Config();
    setWorkerEndpoint(getCloudWorkerEndpoint());
    setAccountId(existing.accountId);
    setDatabaseId(existing.databaseId);
    setApiToken(existing.apiToken);
    setMsg("Loaded current saved credentials.");
    setErr("");
  };

  const saveAndVerify = async()=>{
    const nextConfig: CloudD1Config = {
      accountId: accountId.trim(),
      databaseId: databaseId.trim(),
      apiToken: apiToken.trim(),
    };
    setBusy(true);
    setErr("");
    setMsg("");
    try{
      setCloudWorkerEndpoint(workerEndpoint);
      setCloudD1Config(nextConfig);
      if(nextConfig.accountId && nextConfig.databaseId && nextConfig.apiToken){
        await verifyCloudD1Config(nextConfig);
        setMsg("✅ Cloudflare D1 credentials saved and verified. Sync is active on this device.");
      }else{
        await verifyCloudWorkerEndpoint();
        setMsg("✅ Worker endpoint reachable. Sync is active; D1 credentials can stay blank when worker mode is used.");
      }
      if(onSaved) await onSaved();
    }catch(error){
      setErr(error instanceof Error ? error.message : "Failed to verify cloud sync configuration.");
    }finally{
      setBusy(false);
    }
  };

  const runWorkerCorsSelfTest = async()=>{
    const endpoint = workerEndpoint.trim();
    if(!endpoint){
      setErr("Please enter a Worker endpoint first.");
      setMsg("");
      return;
    }

    setTesting(true);
    setErr("");
    setMsg("");

    try{
      const optionsResp = await fetch(endpoint,{ method:"OPTIONS" });
      const allowOrigin = optionsResp.headers.get("access-control-allow-origin") || "(missing)";
      const allowMethods = optionsResp.headers.get("access-control-allow-methods") || "(missing)";
      const allowHeaders = optionsResp.headers.get("access-control-allow-headers") || "(missing)";

      const postResp = await fetch(endpoint,{
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({ id:crypto.randomUUID(), action:"get", key:"tp-sync-healthcheck" }),
      });
      const postPayload = await postResp.json();

      if(!postResp.ok || postPayload?.ok !== true){
        throw new Error(postPayload?.error ?? `POST healthcheck failed (${postResp.status})`);
      }

      setMsg(`✅ CORS self-test passed. OPTIONS=${optionsResp.status}; A-C-Allow-Origin=${allowOrigin}; A-C-Allow-Methods=${allowMethods}; A-C-Allow-Headers=${allowHeaders}; POST=${postResp.status}.`);
    }catch(error){
      setErr(error instanceof Error ? error.message : "CORS self-test failed.");
    }finally{
      setTesting(false);
    }
  };

  const runD1SchemaTest = async()=>{
    const nextConfig: CloudD1Config = {
      accountId: accountId.trim(),
      databaseId: databaseId.trim(),
      apiToken: apiToken.trim(),
    };
    if(!nextConfig.accountId || !nextConfig.databaseId || !nextConfig.apiToken){
      setErr("Enter Cloudflare Account ID, D1 Database ID, and API Token before running D1 schema test.");
      setMsg("");
      return;
    }

    setD1Testing(true);
    setErr("");
    setMsg("");
    try{
      await verifyCloudD1Config(nextConfig);
      setMsg("✅ D1 schema test passed (CREATE TABLE/INDEX + SELECT 1). D1 fallback is healthy.");
    }catch(error){
      setErr(error instanceof Error ? error.message : "D1 schema test failed.");
    }finally{
      setD1Testing(false);
    }
  };

  return <Card th={th} className="p-6 space-y-4">
    <h3 className="font-semibold text-xl">☁️ Cloud Sync Credentials</h3>
    <p className={cx("text-sm leading-relaxed",th==="dark"?"text-slate-300":"text-slate-600")}>
      Preferred mode uses the Cloudflare Worker endpoint automatically. Optional D1 credentials below are only needed for direct D1 fallback.
    </p>
    <Input th={th} label="Cloudflare Worker Endpoint" value={workerEndpoint} onChange={e=>setWorkerEndpoint(e.target.value)} placeholder="https://your-worker.workers.dev"/>
    <Input th={th} label="Cloudflare Account ID" value={accountId} onChange={e=>setAccountId(e.target.value)}/>
    <Input th={th} label="Cloudflare D1 Database ID" value={databaseId} onChange={e=>setDatabaseId(e.target.value)}/>
    <Input th={th} label="Cloudflare API Token" type="password" value={apiToken} onChange={e=>setApiToken(e.target.value)}/>
    {msg&&<p className="text-emerald-400 text-sm">{msg}</p>}
    {err&&<p className="text-rose-400 text-sm break-words">{err}</p>}
    <div className="flex flex-wrap gap-2">
      <Btn th={th} type="button" onClick={()=>{saveAndVerify().catch(()=>{});}} disabled={busy || testing || d1Testing}>{busy?"Saving…":"Save & Verify"}</Btn>
      <Btn th={th} type="button" v="sec" onClick={()=>{runWorkerCorsSelfTest().catch(()=>{});}} disabled={busy || testing || d1Testing}>{testing?"Testing…":"Run CORS Self-Test"}</Btn>
      <Btn th={th} type="button" v="sec" onClick={()=>{runD1SchemaTest().catch(()=>{});}} disabled={busy || testing || d1Testing}>{d1Testing?"Testing D1…":"Run D1 Schema Test"}</Btn>
      <Btn th={th} type="button" v="sec" onClick={fillFromStored} disabled={busy || testing || d1Testing}>Load Saved</Btn>
    </div>
  </Card>;
}

function AdminPasswordForm({th,t,onSave}:{th:ThemeMode;t:(k:TKey)=>string;onSave:(p:string)=>void}){
  const [pw,setPw]=useState("");const [pw2,setPw2]=useState("");const [msg,setMsg]=useState("");
  const submit=(e:React.FormEvent)=>{e.preventDefault();if(!pw)return;if(pw!==pw2){setMsg(t("passwordMismatch"));return;}
    onSave(pw);setMsg("✓ "+t("passwordUpdated"));setPw("");setPw2("");};
  return <Card th={th} className="p-6 max-w-sm space-y-4">
    <h3 className="font-semibold text-xl">{t("updatePassword")}</h3>
    <form onSubmit={submit} className="space-y-3">
      <Input th={th} label={t("newPassword")} type="password" value={pw} onChange={e=>setPw(e.target.value)}/>
      <Input th={th} label={t("confirmPassword")} type="password" value={pw2} onChange={e=>setPw2(e.target.value)}/>
      {msg&&<p className={msg.startsWith("✓")?"text-emerald-400":"text-rose-400"}>{msg}</p>}
      <Btn th={th} type="submit">{t("updatePassword")}</Btn>
    </form>
  </Card>;
}

/* ═══════════════════════════════════════════════════════════════════════════════
   APP ROOT
   ═══════════════════════════════════════════════════════════════════════════════ */
export function App(){
  const [theme,setTheme]=usePersist<ThemeMode>(SK.theme,"dark");
  const [lang,setLang]=usePersist<Language>(SK.lang,"en");
  const [profiles,setProfiles,profilesMeta]=useSharedPersist<Profile[]>(SK.profiles,[]);
  const [trips,setTrips,tripsMeta]=useSharedPersist<Trip[]>(SK.trips,[]);
  const [adminPw,setAdminPw,adminPwMeta]=useSharedPersist<string>(SK.adminPw,"");
  const [adminAuth,setAdminAuth]=usePersist<boolean>(SK.adminAuth,false);
  const [userId,setUserId]=usePersist<string>(SK.userId,"");
  const [siteCfg,setSiteCfg,siteCfgMeta]=useSharedPersist<SiteSettings>(SK.site,defaultSiteSettings);
  const [view,setView]=useState<ViewMode>("user");
  const [authMode,setAuthMode]=useState<"signin"|"signup">("signin");
  const [showAuth,setShowAuth]=useState(false);
  const [manualSyncing,setManualSyncing]=useState(false);

  const t=useT(lang);

  useEffect(()=>{setProfiles(c=>c.map(normProfile));setTrips(c=>c.map(normTrip));setSiteCfg(c=>normSite(c));},[]);
  useEffect(()=>{document.documentElement.dataset.theme=theme;},[theme]);

  const sharedSyncReady = profilesMeta.hydrated && tripsMeta.hydrated && adminPwMeta.hydrated && siteCfgMeta.hydrated;
  const sharedSyncErrors = [profilesMeta.lastError,tripsMeta.lastError,adminPwMeta.lastError,siteCfgMeta.lastError].filter(Boolean);
  const syncStatusMessage = sharedSyncErrors[0] ?? "";
  const refreshSharedSync = useCallback(async()=>{
    setManualSyncing(true);
    try{
      await Promise.allSettled([profilesMeta.syncNow(),tripsMeta.syncNow(),adminPwMeta.syncNow(),siteCfgMeta.syncNow()]);
    }finally{
      setManualSyncing(false);
    }
  },[adminPwMeta,profilesMeta,siteCfgMeta,tripsMeta]);

  const user=useMemo(()=>profiles.find(p=>p.id===userId),[userId,profiles]);

  const handleSignIn=(ident:string,pw:string)=>{
    if(!sharedSyncReady)return{ok:false,message:"Shared account data is still syncing. Please wait a moment and try again."};
    const found=profiles.find(p=>(p.email.toLowerCase()===ident.trim().toLowerCase()||p.accountName.toLowerCase()===ident.trim().toLowerCase())&&p.password===pw);
    if(!found)return{ok:false,message:t("invalidCredentials")};
    setUserId(found.id);return{ok:true,message:"OK"};
  };

  const handleSignUp=(d:Omit<Profile,"id">)=>{
    const accountName=upper(d.accountName);
    const phone=d.phone.trim();
    if(profiles.some(p=>p.email.toLowerCase()===d.email.trim().toLowerCase()))return{ok:false,message:t("emailExists")};
    if(!isPhoneValid(phone))return{ok:false,message:t("phoneRule")};
    if(profiles.some(p=>p.phone.trim()===phone))return{ok:false,message:t("phoneExists")};
    if(!/^[A-Z]+\d{4}$/.test(accountName))return{ok:false,message:t("accountNameRule")};
    if(profiles.some(p=>p.accountName.toLowerCase()===accountName.toLowerCase()))return{ok:false,message:t("accountExists")};
    if(!meetsPasswordPolicy(d.password))return{ok:false,message:t("passwordPolicy")};
    const p:Profile={...d,id:uid("u"),accountName,firstName:normalizeName(d.firstName),lastName:normalizeName(d.lastName),phone,homeAirport:normalizeAirport(d.homeAirport??"HKG")||"HKG"};
    setProfiles(c=>[...c,p]);setUserId(p.id);return{ok:true,message:"OK"};
  };

  const createTrip=(d:{title:string;location:string;startDate:string;endDate:string})=>{
    if(!user)return;
    const dur=calcDuration(d.startDate,d.endDate);
    const cats=siteCfg.luggageCategories||[];
    const packing:PackingItem[]=cats.flatMap(c=>c.defaultItems.map(l=>({id:uid("pk"),label:l,category:c.name,assignedTo:dn(user),packed:false})));
    const trip:Trip={
      id:tripCode(),ownerId:user.id,ownerName:dn(user),
      title:d.title,location:d.location,startDate:d.startDate,endDate:d.endDate,duration:dur,
      flightNumber:"",airline:"",departureAirport:"",arrivalAirport:"",departureTime:"",arrivalTime:"",terminal:"",bookingReference:"",
      hotelName:"",hotelAddress:"",roomType:"",checkIn:"",checkOut:"",confirmationCode:"",transportMode:"Transit",notes:"",travelNotes:[],
      flightLegs:[],hotels:[],
      bannerColor:"#2563eb",bannerImage:"",members:[user.id],expenses:[],packingList:packing,
      itinerary:[],optionalStops:[],createdAt:new Date().toISOString(),
    };
    setTrips(c=>[trip,...c]);
  };

  const joinTrip=(code:string)=>{
    if(!user)return{ok:false,message:"Not signed in."};
    const trip=trips.find(t=>t.id===code);
    if(!trip)return{ok:false,message:"Trip not found."};
    if(trip.members.includes(user.id))return{ok:false,message:"Already joined."};
    setTrips(c=>c.map(t=>t.id===code?{...t,members:[...t.members,user.id]}:t));
    return{ok:true,message:`Joined "${trip.title}"!`};
  };

  const updateTrip=(id:string,d:Partial<Trip>)=>setTrips(c=>c.map(t=>t.id===id?{...t,...d}:t));
  const addExpense=(tid:string,e:Omit<Expense,"id">)=>setTrips(c=>c.map(t=>t.id===tid?{...t,expenses:[{...e,id:uid("ex")},...t.expenses]}:t));
  const removeExpense=(tid:string,eid:string)=>setTrips(c=>c.map(t=>t.id===tid?{...t,expenses:t.expenses.filter(e=>e.id!==eid)}:t));
  const addPack=(tid:string,l:string,cat:string)=>{
    if(!user)return;
    setTrips(c=>c.map(t=>t.id===tid?{...t,packingList:[...t.packingList,{id:uid("pk"),label:l,category:cat,assignedTo:dn(user),packed:false}]}:t));
  };
  const togglePack=(tid:string,iid:string)=>setTrips(c=>c.map(t=>t.id===tid?{...t,packingList:t.packingList.map(i=>i.id===iid?{...i,packed:!i.packed}:i)}:t));
  const removePack=(tid:string,iid:string)=>setTrips(c=>c.map(t=>t.id===tid?{...t,packingList:t.packingList.filter(i=>i.id!==iid)}:t));
  const updateItin=(tid:string,items:ItineraryItem[])=>setTrips(c=>c.map(t=>t.id===tid?{...t,itinerary:items}:t));
  const deleteTrip=(id:string)=>setTrips(c=>c.filter(t=>t.id!==id));
  const deleteTraveler=(id:string)=>{
    setProfiles(c=>c.filter(p=>p.id!==id));
    setTrips(c=>c.map(t=>({...t,ownerId:t.ownerId===id?"":t.ownerId,ownerName:t.ownerId===id?"Removed":t.ownerName,members:t.members.filter(m=>m!==id),
      expenses:t.expenses.filter(e=>e.paidBy!==id).map(e=>({...e,participants:e.participants.filter(p=>p!==id)}))})));
    if(userId===id)setUserId("");
  };

  const bg=theme==="dark"?"bg-slate-950 text-white":"bg-[#cdd0d8] text-slate-900";
  const showLanding=!user&&view==="user";

  return <div className={cx("min-h-screen transition-colors duration-300",bg)}>
    {showLanding&&<>
      <div className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4">
        <span className="font-bold text-white text-2xl drop-shadow">✈ {siteCfg.siteName}</span>
        <div className="flex gap-2 items-center">
          <select value={lang} onChange={e=>setLang(e.target.value as Language)} className="rounded-full px-3 py-2 text-sm bg-white/15 text-white border border-white/20 outline-none">
            <option value="en" className="text-black">EN</option><option value="zh" className="text-black">中文</option>
          </select>
          <button onClick={()=>setTheme(theme==="dark"?"light":"dark")} className="w-11 h-11 rounded-full bg-white/15 text-white flex items-center justify-center text-xl">{theme==="dark"?"☀️":"🌙"}</button>
          <button onClick={()=>setView("admin")} className="text-white/70 hover:text-white px-4 py-2 rounded-full border border-white/20 hover:bg-white/10 transition">{t("admin")}</button>
        </div>
      </div>
      <Landing th={theme} siteName={siteCfg.siteName} desc={siteCfg.description} t={t}
        onIn={()=>{setAuthMode("signin");setShowAuth(true);}}
        onUp={()=>{setAuthMode("signup");setShowAuth(true);}}/>
    </>}

    {!showLanding&&<Header siteName={siteCfg.siteName} th={theme} setTh={setTheme} lang={lang} setLang={setLang}
      user={user} view={view} setView={setView} t={t}
      onLogout={()=>setUserId("")} onSignIn={()=>{setAuthMode("signin");setShowAuth(true);}}
      onSync={()=>{refreshSharedSync().catch(()=>{});}} isSyncing={manualSyncing}/>}

    {view==="admin"&&!showLanding&&(
      !sharedSyncReady
        ? <div className="max-w-3xl mx-auto px-5 py-20">
            <Card th={theme} className="p-8 space-y-4">
              <h2 className="text-2xl font-bold">☁️ Syncing shared travel data…</h2>
              <p className={cx(theme==="dark"?"text-slate-300":"text-slate-600")}>
                Please wait while this device loads shared accounts, trips, admin settings, and website settings from the cloud worker.
              </p>
              {syncStatusMessage && <div className={cx("rounded-2xl border p-4 text-sm leading-relaxed",
                theme==="dark"?"border-amber-400/30 bg-amber-400/10 text-amber-200":"border-amber-200 bg-amber-50 text-amber-800")}>
                <p className="font-semibold">Sync error</p>
                <p className="mt-1 break-words">{syncStatusMessage}</p>
                <p className="mt-2">Possible fixes: confirm both devices use the same app URL, clear any stale cloud endpoint override in local storage, and verify the Cloudflare D1 database credentials are valid.</p>
              </div>}
              <div className="flex gap-2 items-center">
                <Btn th={theme} onClick={()=>{refreshSharedSync().catch(()=>{});}} disabled={manualSyncing}>
                  {manualSyncing ? "Syncing…" : "Retry Sync"}
                </Btn>
                <p className={cx("text-sm",theme==="dark"?"text-slate-400":"text-slate-500")}>
                  Auto-sync still runs every 15 seconds and on focus/online.
                </p>
              </div>
            </Card>
          </div>
        : <AdminWorkspace profiles={profiles} trips={trips} th={theme} t={t}
            adminPw={adminPw} adminAuth={adminAuth} setAdminPw={setAdminPw} setAdminAuth={setAdminAuth}
            siteCfg={siteCfg} setSiteCfg={setSiteCfg} onDeleteTrip={deleteTrip} onDeleteTraveler={deleteTraveler}
            onRefreshSync={refreshSharedSync}/>
    )}

    {view==="user"&&user&&<UserWorkspace user={user} trips={trips} profiles={profiles} siteCfg={siteCfg} th={theme} t={t}
      onUpdate={d=>setProfiles(c=>c.map(p=>p.id===user.id?{...p,...d,
        accountName: d.accountName!==undefined ? upper(d.accountName) : p.accountName,
        firstName: d.firstName!==undefined ? normalizeName(d.firstName) : p.firstName,
        lastName: d.lastName!==undefined ? normalizeName(d.lastName) : p.lastName,
        phone: d.phone!==undefined ? d.phone.replace(/\D/g,"").slice(0,8) : p.phone,
        homeAirport: d.homeAirport!==undefined ? (normalizeAirport(d.homeAirport)||"HKG") : p.homeAirport,
      }:p))}
      onCreate={createTrip} onJoin={joinTrip} onTripUpdate={updateTrip}
      onAddExp={addExpense} onAddPack={addPack} onTogglePack={togglePack} onRemovePack={removePack} onUpdateItin={updateItin} onRemoveExp={removeExpense}/>}

    <AuthModal open={showAuth} mode={authMode} th={theme} t={t} onClose={()=>setShowAuth(false)}
      onSignIn={handleSignIn} onSignUp={handleSignUp} onToggle={()=>setAuthMode(m=>m==="signin"?"signup":"signin")}/>
  </div>;
}

const rootEl = document.getElementById("root");

if (rootEl) {
  createRoot(rootEl).render(<App />);
}
