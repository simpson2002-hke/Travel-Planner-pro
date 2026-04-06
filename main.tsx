import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ButtonHTMLAttributes, ChangeEvent, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, SetStateAction, TextareaHTMLAttributes } from "react";
import { createRoot } from "react-dom/client";
import { motion } from "framer-motion";
import { translations, type Language, type TKey } from "./i18n";
import "./index.css";

/* ═══════════════════════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════════════════════ */
type ThemeMode = "light" | "dark";
type ViewMode = "user" | "admin";
type TripTab = "overview" | "travelers" | "itinerary" | "expenses" | "luggage" | "settings" | "instructions";
type AdminTab = "trips" | "travelers" | "luggage" | "website" | "password";
type UserSection = "dashboard" | "trips";

type Profile = {
  id: string; accountName: string; firstName: string; lastName: string;
  email: string; phone: string; password: string;
  icon?: string;
  iconImage?: string;
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
  splitType?: "equal" | "custom";
  customSplits?: Record<string, number>;
};

type PackingItem = {
  id: string; label: string; category: string; assignedTo: string; packed?: boolean;
  packedBy?: Record<string, boolean>;
  isSharedDefault?: boolean; createdById?: string;
  isTemplateDefault?: boolean;
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
  photo?: string; mapUrl?: string; transitToNext?: TransitLeg; activityType?: "regular" | "free-time";
  needsFollowUp?: boolean; followUpNote?: string;
  mediaSize?: "small" | "medium" | "large";
  freeTimeOwnerId?: string;
  freeTimeParticipantIds?: string[];
};

type OptionalStop = {
  id: string; day: number; type: "site" | "restaurant" | "other"; title: string; location: string;
  url: string; mapUrl?: string; notes: string;
};

type FreeTimeEntry = {
  id: string; day: number; startTime: string; endTime: string; title: string;
  editorId: string; participantIds: string[]; pendingJoinIds: string[]; notes: string;
};

type TripRole = "owner" | "editor" | "viewer";
type ReminderTemplate = {
  subject: string;
  body: string;
  includeTripTitle: boolean;
  includeDates: boolean;
  includeLocation: boolean;
  includeTripId: boolean;
  includeHotelSummary: boolean;
  includeFlightSummary: boolean;
  includeNotesSummary: boolean;
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
  memberRoles: Record<string, TripRole>;
  members: string[]; expenses: Expense[];
  itineraryChecklists: Record<string, Record<string, boolean>>;
  packingList: PackingItem[]; itinerary: ItineraryItem[]; optionalStops: OptionalStop[];
  freeTimeEntries: FreeTimeEntry[];
  reminderTemplate?: ReminderTemplate;
  luggageTemplateVersion?: string;
  luggageCustomized?: boolean;
  createdAt: string;
  customLocation?: {name:string;lat:number;lon:number};
  weatherLocations?: { id: string; label: string; startDay: number; endDay: number; location: GeoPoint }[];
};

type WeatherData = {
  current: { temp: number; condition: string; wind: number; high: number; low: number };
  forecast: { date: string; high: number; low: number; condition: string }[];
  monthlyClimate?: { month:string; avgHigh:number; avgLow:number; avgRain:number }[];
};

type GeoPoint = { name: string; lat: number; lon: number };
type GeoSearchResult = GeoPoint & { subtitle: string };

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
const EXPENSE_CAT_LABEL_KEY: Record<string, TKey> = {
  Food: "expenseCatFood",
  Transport: "expenseCatTransport",
  Accommodation: "expenseCatAccommodation",
  Activities: "expenseCatActivities",
  Shopping: "expenseCatShopping",
  Other: "expenseCatOther",
};
const expenseCategoryLabel = (category:string,t:(k:TKey)=>string)=>EXPENSE_CAT_LABEL_KEY[category] ? t(EXPENSE_CAT_LABEL_KEY[category]) : category;
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
const AVATAR_EMOJI_OPTIONS = ["😀","😎","🧳","✈️","🌍","🏝️","🏔️","📸","🧭","🗺️","🍜","🏖️"];
const DEFAULT_REMINDER_TEMPLATE: ReminderTemplate = {
  subject: "Trip reminder: {tripTitle}",
  body: "Hi travellers,\n\nThis is a reminder for our upcoming trip.\n\nSafe travels!",
  includeTripTitle: true,
  includeDates: true,
  includeLocation: true,
  includeTripId: true,
  includeHotelSummary: true,
  includeFlightSummary: true,
  includeNotesSummary: false,
};
const TEMPLATE_LUGGAGE_ASSIGNED_TO = "ALL_TRAVELERS";
const templateItemKey = (category:string,label:string)=>`${category.trim().toLowerCase()}::${label.trim().toLowerCase()}`;
const luggageTemplateVersion = (siteCfg:SiteSettings)=>{
  const rows = (siteCfg.luggageCategories ?? [])
    .map(category=>({
      name: category.name.trim(),
      items: [...(category.defaultItems ?? [])].map(item=>item.trim()).filter(Boolean).sort((a,b)=>a.localeCompare(b)),
    }))
    .sort((a,b)=>a.name.localeCompare(b.name))
    .map(category=>`${category.name}:${category.items.join("|")}`);
  return rows.join("||");
};
const buildTemplatePackingList = (siteCfg:SiteSettings, ownerId:string):PackingItem[]=>{
  const seen = new Set<string>();
  const rows: PackingItem[] = [];
  for(const category of siteCfg.luggageCategories ?? []){
    for(const label of category.defaultItems ?? []){
      const cleanLabel = label.trim();
      if(!cleanLabel) continue;
      const key = templateItemKey(category.name, cleanLabel);
      if(seen.has(key)) continue;
      seen.add(key);
      rows.push({
        id: uid("pk"),
        label: cleanLabel,
        category: category.name,
        assignedTo: TEMPLATE_LUGGAGE_ASSIGNED_TO,
        packedBy: {},
        isSharedDefault: true,
        isTemplateDefault: true,
        createdById: ownerId,
      });
    }
  }
  return rows;
};
const isTemplateManagedItem = (item:PackingItem)=>Boolean(item.isTemplateDefault ?? (item.isSharedDefault && item.assignedTo===TEMPLATE_LUGGAGE_ASSIGNED_TO));
const syncTripPackingWithCurrentTemplate = (trip:Trip, siteCfg:SiteSettings):Trip=>{
  const nextVersion = luggageTemplateVersion(siteCfg);
  if(trip.luggageCustomized) return { ...trip, luggageTemplateVersion: trip.luggageTemplateVersion ?? nextVersion };
  if(trip.luggageTemplateVersion===nextVersion) return trip;
  const retainedItems = (trip.packingList ?? []).filter(item=>!isTemplateManagedItem(item));
  return {
    ...trip,
    packingList: [...buildTemplatePackingList(siteCfg, trip.ownerId), ...retainedItems],
    luggageTemplateVersion: nextVersion,
    luggageCustomized: false,
  };
};

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
const getTripRole = (trip:Trip,userId:string):TripRole=>{
  const roles = trip.memberRoles ?? {};
  return roles[userId] ?? (userId===trip.ownerId?"owner":"viewer");
};
const canEditSettings = (role:TripRole)=>role==="owner"||role==="editor";
const canEditItinerary = (role:TripRole)=>role==="owner"||role==="editor";
const canEditExpenses = (_role:TripRole)=>true;
const tripRoleLabel = (role:TripRole,t:(k:TKey)=>string)=>role==="owner"?t("roleOwner"):role==="editor"?t("roleEditor"):t("roleViewer");
const buildGmailComposeUrl = (to:string, subject:string, body:string)=>{
  const params = new URLSearchParams({
    view: "cm",
    fs: "1",
    tf: "1",
    to,
    su: subject,
    body,
  });
  return `https://mail.google.com/mail/?${params.toString()}`;
};
const resolveReminderRecipients = (memberIds:string[], profiles:Profile[])=>memberIds
  .map(id=>profiles.find(profile=>profile.id===id))
  .filter((member):member is Profile=>Boolean(member?.email?.trim()))
  .map(member=>member.email.trim());
const isCjkQuery = (query:string)=>/[\u3400-\u9FFF]/.test(query);
const withOptionalWeatherLanguage = (url:string, query:string)=>{
  if(!isCjkQuery(query)) return url;
  try{
    const next = new URL(url);
    next.searchParams.set("language","zh");
    return next.toString();
  }catch{
    if(/([?&])language=/.test(url)){
      return url.replace(/([?&]language=)[^&]*/,"$1zh");
    }
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}language=zh`;
  }
};
const isWebAttachmentUrl = (url:string)=>/^https?:\/\//i.test(url.trim());
const buildReminderNotesSummary = (notes:TravelNote[], t:(k:TKey)=>string)=>{
  const noteTexts = notes.slice(0,3).map(note=>note.text?.trim()).filter(Boolean);
  const attachmentLinks = notes
    .flatMap(note=>note.attachments ?? [])
    .filter(attachment=>isWebAttachmentUrl(attachment.url))
    .slice(0,6)
    .map(attachment=>`${attachment.name || t("attachments")}: ${attachment.url.trim()}`);
  return { noteTexts, attachmentLinks };
};
const openReminderDraftInGmail = ({memberIds,profiles,subjectTemplate,tripTitle,body}:{memberIds:string[];profiles:Profile[];subjectTemplate:string;tripTitle:string;body:string;})=>{
  const recipients = resolveReminderRecipients(memberIds,profiles);
  if(recipients.length===0) return false;
  const subject = (subjectTemplate || "Trip reminder: {tripTitle}").replaceAll("{tripTitle}",tripTitle);
  const maxBodyLength = 6000;
  const normalizedBody = body.length > maxBodyLength ? `${body.slice(0,maxBodyLength)}\n\n...` : body;
  const gmailUrl = buildGmailComposeUrl(recipients.join(","), subject, normalizedBody);
  window.open(gmailUrl,"_blank","noopener,noreferrer");
  return true;
};
const toTimeMinutes = (time:string)=>{
  const [rawH,rawM] = (time || "").split(":");
  const h = Number(rawH);
  const m = Number(rawM);
  if(!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return Math.max(0,Math.min(23,h))*60 + Math.max(0,Math.min(59,m));
};
const sortItineraryByDayAndTime=(items:ItineraryItem[])=>{
  const byDay = new Map<number,ItineraryItem[]>();
  for(const item of items){
    const key = item.day || 1;
    byDay.set(key,[...(byDay.get(key) ?? []),item]);
  }
  const dayOrderMaps = new Map<number,Map<string,number>>();
  for(const [day,dayItems] of byDay.entries()){
    const sorted = [...dayItems].sort((a,b)=>
      (a.startTime || "23:59").localeCompare(b.startTime || "23:59")
      || (a.endTime || "23:59").localeCompare(b.endTime || "23:59")
      || a.title.localeCompare(b.title)
      || a.id.localeCompare(b.id));
    dayOrderMaps.set(day,new Map(sorted.map((item,index)=>[item.id,index+1])));
  }
  return items.map(item=>({
    ...item,
    order: dayOrderMaps.get(item.day || 1)?.get(item.id) ?? item.order,
  }));
};
const hasTimeOverlap=(candidate:Pick<ItineraryItem,"startTime"|"endTime"|"endDayOffset">, existing:Pick<ItineraryItem,"startTime"|"endTime"|"endDayOffset">)=>{
  const startA = toTimeMinutes(candidate.startTime);
  const endA = toTimeMinutes(candidate.endTime);
  const startB = toTimeMinutes(existing.startTime);
  const endB = toTimeMinutes(existing.endTime);
  if(startA===null || endA===null || startB===null || endB===null) return false;
  const absStartA = startA;
  const absEndA = (candidate.endDayOffset ?? 0) * 1440 + endA;
  const absStartB = startB;
  const absEndB = (existing.endDayOffset ?? 0) * 1440 + endB;
  return absStartA < absEndB && absStartB < absEndA;
};
const normalizeReminderTemplate = (template?:Partial<ReminderTemplate>):ReminderTemplate=>({
  ...DEFAULT_REMINDER_TEMPLATE,
  ...template,
});

function calcDuration(s:string,e:string){
  if(!s||!e) return 1;
  return Math.max(1, Math.ceil((new Date(e).getTime()-new Date(s).getTime())/(864e5))+1);
}

function tripCountdownLabel(startDate:string, endDate:string, t?:(k:TKey)=>string, nowDate = new Date()){
  const now = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());
  const start = new Date(startDate);
  const end = new Date(endDate);
  const startOnly = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endOnly = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const daysUntil = Math.ceil((startOnly.getTime() - now.getTime()) / 86400000);
  if(daysUntil > 1) return t ? t("daysLeft").replace("{count}",String(daysUntil)) : `${daysUntil} days left`;
  if(daysUntil === 1) return t ? t("startsTomorrow") : "1 day left";
  if(daysUntil === 0) return t ? t("startsToday") : "Starts today";
  if(endOnly >= now) return t ? t("inProgress") : "In progress";
  const daysAgo = Math.max(1, Math.ceil((now.getTime()-endOnly.getTime())/86400000));
  return t ? t("endedDaysAgo").replace("{count}",String(daysAgo)) : "Completed";
}

function usePersist<T>(key:string,init:T){
  const [s,setState]=useState<T>(()=>{try{const r=localStorage.getItem(key);return r?JSON.parse(r):init;}catch{return init;}});
  const set = useCallback((next:SetStateAction<T>)=>{
    setState(prev=>{
      const resolved = typeof next === "function" ? (next as (value:T)=>T)(prev) : next;
      try{localStorage.setItem(key,JSON.stringify(resolved));}catch{}
      return resolved;
    });
  },[key]);
  useEffect(()=>{try{localStorage.setItem(key,JSON.stringify(s));}catch{}},[key,s]);
  return [s,set] as const;
}

function usePortraitMobile(){
  const [isPortraitMobile,setIsPortraitMobile]=useState(()=>{
    if(typeof window==="undefined") return false;
    return window.matchMedia("(max-width: 767px) and (orientation: portrait)").matches;
  });

  useEffect(()=>{
    if(typeof window==="undefined") return;
    const mediaQuery=window.matchMedia("(max-width: 767px) and (orientation: portrait)");
    const update=()=>setIsPortraitMobile(mediaQuery.matches);
    update();
    mediaQuery.addEventListener?.("change",update);
    window.addEventListener("resize",update);
    return ()=>{
      mediaQuery.removeEventListener?.("change",update);
      window.removeEventListener("resize",update);
    };
  },[]);

  return isPortraitMobile;
}

function useMobileScreen(){
  const [isMobileScreen,setIsMobileScreen]=useState(()=>{
    if(typeof window==="undefined") return false;
    return window.matchMedia("(max-width: 900px)").matches;
  });

  useEffect(()=>{
    if(typeof window==="undefined") return;
    const mediaQuery=window.matchMedia("(max-width: 900px)");
    const update=()=>setIsMobileScreen(mediaQuery.matches);
    update();
    mediaQuery.addEventListener?.("change",update);
    window.addEventListener("resize",update);
    return ()=>{
      mediaQuery.removeEventListener?.("change",update);
      window.removeEventListener("resize",update);
    };
  },[]);

  return isMobileScreen;
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
const CLOUD_EDITOR_PRIORITY_MS = 120000;

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

function getCloudWorkerEndpointCandidates(){
  const candidates: { endpoint: string; source: "override" | "deployed-default" }[] = [];
  const seen = new Set<string>();

  const addCandidate = (endpoint: string | undefined, source: "override" | "deployed-default")=>{
    const next = endpoint?.trim();
    if(!next || seen.has(next)) return;
    seen.add(next);
    candidates.push({ endpoint: next, source });
  };

  try{
    addCandidate(localStorage.getItem(CLOUD_WORKER_ENDPOINT_KEY) ?? "", "override");
  }catch{}

  addCandidate(DEPLOYED_CLOUDFLARE_WORKER_ENDPOINT, "deployed-default");
  return candidates;
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
  let res: Response;
  try{
    res = await fetch(endpoint,{
      method:"POST",
      headers:{
        "content-type":"application/json",
        "authorization":`Bearer ${config.apiToken}`,
      },
      body:JSON.stringify({sql,params}),
    });
  }catch(error){
    const rawMessage = error instanceof Error ? error.message : "Unknown fetch error.";
    throw new Error(
      `Cloudflare D1 API fetch failed for ${endpoint}. ${rawMessage} `+
      "Direct D1 API calls from browsers are often blocked by CORS; prefer Worker endpoint mode for client-side sync."
    );
  }
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

async function verifyCloudWorkerEndpoint(endpointOverride?:string){
  const endpoint = endpointOverride?.trim() || getCloudWorkerEndpoint();
  if(!endpoint) throw new Error("Cloud worker endpoint missing.");
  try{
    const response = await fetch(endpoint,{
      method:"POST",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({ id:crypto.randomUUID(), action:"get", key:"tp-sync-healthcheck" }),
    });
    const payload = await response.json();
    if(!response.ok || payload?.ok !== true){
      throw new Error(payload?.error ?? `Cloud worker request failed (${response.status})`);
    }
  }catch(error){
    const rawMessage = error instanceof Error ? error.message : "Unknown worker request error.";
    throw new Error(
      `Worker verification failed for ${endpoint}. ${rawMessage} `+
      "If this says 'Failed to fetch', check CORS allow-origin/headers, HTTPS certificate, and that the Worker route is publicly reachable."
    );
  }
}

async function cloudStorageRequest(action:string,key:string,value?:unknown){
  const workerEndpoints = getCloudWorkerEndpointCandidates();
  const workerErrors: string[] = [];
  const hasLocalOverride = workerEndpoints.some((item)=>item.source==="override");

  for(const candidate of workerEndpoints){
    const workerEndpoint = candidate.endpoint;
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
      if(hasLocalOverride && candidate.source==="deployed-default"){
        setCloudWorkerEndpoint("");
      }
      return payload?.data;
    }catch(error){
      const rawMessage = error instanceof Error ? error.message : "Unknown worker fetch error.";
      workerErrors.push(
        `Worker fetch failed for ${workerEndpoint}: ${rawMessage}. `+
        "If this says 'Failed to fetch', verify Worker CORS headers and that the endpoint is reachable from the browser."
      );
    }
  }

  const config = getCloudD1Config();
  const canUseDirectD1Fallback = workerEndpoints.length===0 && config.accountId && config.databaseId && config.apiToken;
  if(canUseDirectD1Fallback){
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
  if(workerEndpoints.length>0){
    throw new Error(`Cloud sync failed in Worker mode.${workerMessage}`);
  }
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
  const initialSerializedRef = useRef(JSON.stringify(init));
  const stateRef = useRef(s);
  const hasUnsyncedLocalRef = useRef(false);
  const lastLocalEditAtRef = useRef(0);
  const hydratedRef = useRef(false);
  const syncPrimedRef = useRef(false);
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
    hasUnsyncedLocalRef.current = false;
    setLastError("");
  },[key]);

  const pullRemote = useCallback(async()=>{
    if(!CLOUD_SHARED_KEYS.has(key)) return;

    const remote = await cloudStorageRequest("get",key);
    if(!remote?.exists){
      await pushRemote();
      syncPrimedRef.current = true;
      hydratedRef.current = true;
      setHydrated(true);
      setLastError("");
      return;
    }

    const envelope = parseCloudEnvelope<T>(remote.value);
    const remoteValue = envelope ? envelope.value : remote.value as T;
    const remoteUpdatedAt = envelope?.updatedAt ?? "";
    const remoteDeviceId = envelope?.deviceId ?? "";
    const localSerialized = JSON.stringify(stateRef.current);
    const remoteSerialized = JSON.stringify(remoteValue);
    const localLooksUnchanged = localSerialized === initialSerializedRef.current;
    const isOtherDeviceUpdate = Boolean(remoteDeviceId) && remoteDeviceId !== deviceIdRef.current;
    const localEditorHasPriority = isOtherDeviceUpdate && Date.now() - lastLocalEditAtRef.current < CLOUD_EDITOR_PRIORITY_MS;
    const shouldAdoptRemote =
      (!hydratedRef.current && localLooksUnchanged) ||
      (
        remoteUpdatedAt &&
        remoteUpdatedAt > latestRemoteAtRef.current &&
        remoteSerialized !== localSerialized &&
        !hasUnsyncedLocalRef.current &&
        !localEditorHasPriority
      );

    if(remoteUpdatedAt && remoteUpdatedAt > latestRemoteAtRef.current){
      latestRemoteAtRef.current = remoteUpdatedAt;
    }

    if(shouldAdoptRemote && remoteSerialized !== localSerialized){
      skipNextPushRef.current = true;
      set(remoteValue);
    }

    hydratedRef.current = true;
    syncPrimedRef.current = true;
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
    if(!syncPrimedRef.current) return;
    if(skipNextPushRef.current){
      skipNextPushRef.current = false;
      return;
    }
    lastLocalEditAtRef.current = Date.now();
    hasUnsyncedLocalRef.current = true;
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
    if(hasUnsyncedLocalRef.current){
      try{
        await pushRemote();
      }catch(error){
        setLastError(error instanceof Error ? error.message : "Cloud sync failed.");
      }
    }
    await pullRemote();
  },[pullRemote,pushRemote]);

  return [s,set,{hydrated,lastError,syncNow}] as const;
}

function useT(lang:Language){ return (k:TKey)=>translations[lang][k]; }

async function copyText(v:string){
  try{
    await navigator.clipboard?.writeText(v);
    return true;
  }catch{
    return false;
  }
}

function buildUrl(tpl:string,rep:Record<string,string|number>){
  return Object.entries(rep).reduce((c,[k,v])=>c.split(`{${k}}`).join(k==="query"?encodeURIComponent(String(v)):String(v)),tpl);
}

function normProfile(i:unknown):Profile{
  const p=(i??{}) as Partial<Profile>;
  return { id:p.id??uid("u"), accountName:upper(p.accountName??""), firstName:normalizeName(p.firstName??""),
    lastName:normalizeName(p.lastName??""), email:p.email??"", phone:p.phone??"", password:p.password??"", dateOfBirth:p.dateOfBirth??"",
    icon:p.icon??"",
    iconImage:p.iconImage??"",
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
  const members = Array.isArray(t.members) ? t.members : [];
  const rawRoles = (t.memberRoles && typeof t.memberRoles==="object" ? t.memberRoles : {}) as Record<string, TripRole>;
  const memberRoles = members.reduce<Record<string, TripRole>>((acc,memberId)=>{
    const existing = rawRoles[memberId];
    acc[memberId] = existing==="owner"||existing==="editor"||existing==="viewer"
      ? existing
      : existing==="co-owner"
        ? "editor"
        : existing==="joiner"
          ? "viewer"
          : (memberId===t.ownerId ? "owner" : "viewer");
    return acc;
  },{});
  if(t.ownerId && memberRoles[t.ownerId] !== "owner"){
    memberRoles[t.ownerId] = "owner";
  }
  const rawChecklists = (t.itineraryChecklists && typeof t.itineraryChecklists==="object" ? t.itineraryChecklists : {}) as Record<string, Record<string, boolean>>;
  const itineraryChecklists = members.reduce<Record<string, Record<string, boolean>>>((acc,memberId)=>{
    const checklist = rawChecklists[memberId];
    acc[memberId] = checklist && typeof checklist==="object" ? checklist : {};
    return acc;
  },{});
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
    memberRoles, members, expenses:Array.isArray(t.expenses)?t.expenses.map((expense,index)=>({
      id: expense.id ?? uid(`ex-${index}`),
      date: expense.date ?? "",
      title: expense.title ?? "",
      amount: typeof expense.amount === "number" ? expense.amount : Number(expense.amount ?? 0),
      currency: expense.currency ?? "USD",
      category: expense.category ?? "Other",
      paidBy: expense.paidBy ?? "",
      participants: Array.isArray(expense.participants) ? expense.participants : [],
      notes: expense.notes ?? "",
      splitType: expense.splitType === "custom" ? "custom" : "equal",
      customSplits: expense.customSplits && typeof expense.customSplits === "object" ? expense.customSplits : {},
    })):[],
    itineraryChecklists,
    packingList:Array.isArray(t.packingList)?t.packingList.map((item,index)=>({
      id: item.id ?? uid(`pk-${index}`),
      label: item.label ?? "",
      category: item.category ?? "General",
      assignedTo: item.assignedTo ?? "",
      packed: item.packed !== undefined ? Boolean(item.packed) : undefined,
      packedBy: item.packedBy && typeof item.packedBy === "object"
        ? item.packedBy
        : (item.packed !== undefined ? {"legacy":Boolean(item.packed)} : {}),
      isSharedDefault: Boolean(item.isSharedDefault),
      isTemplateDefault: Boolean(item.isTemplateDefault ?? (item.isSharedDefault && item.assignedTo===TEMPLATE_LUGGAGE_ASSIGNED_TO)),
      createdById: item.createdById ?? "",
    })):[],
    itinerary:rawItinerary.map((item,index)=>({
      ...(item as ItineraryItem),
      order: typeof (item as ItineraryItem).order === "number" ? (item as ItineraryItem).order : index + 1,
      startTime: (item as ItineraryItem).startTime ?? (item as {time?:string}).time ?? "",
      endTime: (item as ItineraryItem).endTime ?? (item as {time?:string}).time ?? "",
      endDayOffset: (item as ItineraryItem).endDayOffset ?? 0,
      stopLocation: (item as ItineraryItem).stopLocation ?? "",
      photo: (item as ItineraryItem).photo ?? "",
      mapUrl: (item as ItineraryItem).mapUrl ?? "",
      needsFollowUp: Boolean((item as ItineraryItem).needsFollowUp),
      followUpNote: (item as ItineraryItem).followUpNote ?? "",
      mediaSize: (item as ItineraryItem).mediaSize ?? "small",
      transitToNext: (item as ItineraryItem).transitToNext ?? { duration: "", details: "" },
      activityType: (item as ItineraryItem).activityType
        ?? ((item as ItineraryItem).transport === "Free Time"
          ? "free-time"
          : ((item as ItineraryItem).transport && (item as ItineraryItem).transport !== "Activity" ? "transport" : "regular")),
      freeTimeOwnerId: (item as ItineraryItem).freeTimeOwnerId ?? "",
      freeTimeParticipantIds: Array.isArray((item as ItineraryItem).freeTimeParticipantIds) ? (item as ItineraryItem).freeTimeParticipantIds : [],
    })),
    optionalStops: Array.isArray((t as Partial<Trip>).optionalStops) ? (t as Partial<Trip>).optionalStops!.map((stop, index) => ({
      id: stop.id ?? uid(`opt-${index}`), day: typeof stop.day === "number" ? stop.day : 1,
      type: stop.type === "restaurant" || stop.type === "other" ? stop.type : "site",
      title: stop.title ?? "", location: stop.location ?? "", url: stop.url ?? "", mapUrl: stop.mapUrl ?? "", notes: stop.notes ?? "",
    })) : [],
    freeTimeEntries: Array.isArray((t as Partial<Trip>).freeTimeEntries) ? (t as Partial<Trip>).freeTimeEntries!.map((entry, index) => ({
      id: entry.id ?? uid(`ft-${index}`),
      day: typeof entry.day === "number" ? entry.day : 1,
      startTime: entry.startTime ?? "",
      endTime: entry.endTime ?? "",
      title: entry.title ?? "Free time",
      editorId: entry.editorId ?? "",
      participantIds: Array.isArray(entry.participantIds) ? entry.participantIds : [],
      pendingJoinIds: Array.isArray(entry.pendingJoinIds) ? entry.pendingJoinIds : [],
      notes: entry.notes ?? "",
    })) : [],
    createdAt:t.createdAt??new Date().toISOString(),
    reminderTemplate: normalizeReminderTemplate((t as Partial<Trip>).reminderTemplate),
    luggageTemplateVersion: t.luggageTemplateVersion ?? "",
    luggageCustomized: Boolean(t.luggageCustomized),
    customLocation:t.customLocation,
    weatherLocations: Array.isArray((t as Partial<Trip>).weatherLocations)
      ? (t as Partial<Trip>).weatherLocations!
          .map((item, index) => ({
            id: item?.id ?? uid(`wloc-${index}`),
            label: item?.label ?? item?.location?.name ?? "",
            startDay: typeof item?.startDay === "number" ? item.startDay : 1,
            endDay: typeof item?.endDay === "number" ? item.endDay : Math.max(1, t.duration ?? calcDuration(start, end)),
            location: {
              name: item?.location?.name ?? item?.label ?? "",
              lat: Number(item?.location?.lat ?? 0),
              lon: Number(item?.location?.lon ?? 0),
            },
          }))
          .filter(item=>item.label.trim() && Number.isFinite(item.location.lat) && Number.isFinite(item.location.lon))
      : undefined };
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

function settlements(trip:Trip,profiles:Profile[],currency?:string){
  const mems=trip.members.map(id=>profiles.find(p=>p.id===id)).filter(Boolean) as Profile[];
  const led=new Map<string,{name:string;paid:number;share:number}>();
  for(const m of mems) led.set(m.id,{name:dn(m),paid:0,share:0});
  const expenses = currency ? trip.expenses.filter(exp=>exp.currency===currency) : trip.expenses;
  for(const e of expenses){
    const payer=led.get(e.paidBy); if(payer) payer.paid+=e.amount;
    const inc=e.participants.length?e.participants:mems.map(m=>m.id);
    if(e.splitType==="custom" && e.customSplits){
      for(const pid of inc){
        const x=led.get(pid);
        if(x) x.share += Number(e.customSplits[pid] ?? 0);
      }
    }else{
      const each=e.amount/(inc.length||1);
      for(const pid of inc){const x=led.get(pid);if(x) x.share+=each;}
    }
  }
  const bal=[...led.entries()].map(([id,r])=>({id,name:r.name,paid:r.paid,share:r.share,net:+(r.paid-r.share).toFixed(2)}));
  const cred=bal.filter(b=>b.net>0.01).map(b=>({...b})).sort((a,b)=>b.net-a.net);
  const debt=bal.filter(b=>b.net<-0.01).map(b=>({...b,debt:Math.abs(b.net)})).sort((a,b)=>b.debt-a.debt);
  const sett:{from:string;to:string;amount:number}[]=[];
  for(const d of debt){let rem=d.debt;for(const c of cred){if(rem<=0.01||c.net<=0.01)continue;const a=Math.min(rem,c.net);sett.push({from:d.name,to:c.name,amount:+a.toFixed(2)});rem-=a;c.net-=a;}}
  return {total:expenses.reduce((s,e)=>s+e.amount,0),bal,sett};
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

type PdfSectionId = "overview" | "flights" | "hotels" | "itinerary" | "notes" | "expenses" | "luggage";
const PDF_SECTION_ORDER: { id: PdfSectionId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "flights", label: "Flight details" },
  { id: "hotels", label: "Hotel stays" },
  { id: "itinerary", label: "Itinerary" },
  { id: "notes", label: "Travel notes" },
  { id: "expenses", label: "Expenses" },
  { id: "luggage", label: "Luggage" },
];

function exportTripToPdf(trip:Trip, members:Profile[], t:(k:TKey)=>string, includedSections:PdfSectionId[] = PDF_SECTION_ORDER.map(section=>section.id)){
  const itineraryByDay = Array.from({length:trip.duration}, (_,index)=>index+1).map(day=>({
    day,
    items: trip.itinerary.filter(item=>item.day===day).sort((a,b)=>a.order-b.order),
    optionalStops: trip.optionalStops.filter(stop=>stop.day===day),
  }));
  const expenseTotalsByCurrency = trip.expenses.reduce<Record<string, number>>((acc, expense)=>{
    const currency = expense.currency || "USD";
    acc[currency] = (acc[currency] ?? 0) + expense.amount;
    return acc;
  }, {});
  const sectionSet = new Set(includedSections);
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(trip.title)} PDF</title>
    <style>
      :root { color-scheme: light; }
      * { box-sizing: border-box; }
      body { margin: 0; padding: 24px; font-family: Inter, Arial, sans-serif; color: #0f172a; background: #f8fafc; font-size: 12.5px; }
      h1,h2,h3,p { margin: 0; }
      .hero { padding: 20px; border-radius: 18px; background: linear-gradient(135deg, #1d4ed8, #7c3aed); color: white; }
      .hero p { margin-top: 6px; opacity: 0.92; }
      .section { margin-top: 14px; background: white; border: 1px solid #dbe3f0; border-radius: 14px; padding: 14px; page-break-inside: avoid; }
      .section-title { font-size: 16px; font-weight: 800; margin-bottom: 10px; }
      .grid { display: grid; gap: 12px; }
      .grid.cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .grid.cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .tile { border: 1px solid #dbe3f0; border-radius: 10px; padding: 10px; background: #f8fafc; min-height: 62px; }
      .label { font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; color: #64748b; margin-bottom: 4px; }
      .value { font-size: 12px; line-height: 1.4; font-weight: 600; white-space: pre-wrap; word-break: break-word; }
      .muted { color: #64748b; font-size: 11px; }
      .card-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
      .card { border: 1px solid #dbe3f0; border-radius: 12px; padding: 10px; page-break-inside: avoid; break-inside: avoid; }
      .row { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
      .route { font-size: 14px; font-weight: 800; margin-top: 4px; }
      .pill { display: inline-block; border-radius: 999px; padding: 4px 8px; background: #dbeafe; color: #1d4ed8; font-size: 10px; font-weight: 700; }
      ul { margin: 8px 0 0; padding-left: 16px; }
      li { margin-top: 4px; line-height: 1.35; }
      .day { margin-top: 10px; border-top: 1px solid #e2e8f0; padding-top: 10px; }
      .day:first-of-type { margin-top: 0; border-top: 0; padding-top: 0; }
      @media print { body { background: white; padding: 14px; } .section { break-inside: avoid; } }
    </style>
  </head>
  <body>
    <section class="hero">
      <h1>${escapeHtml(trip.title)}</h1>
      <p>${escapeHtml(trip.location)} · ${escapeHtml(fmtDate(trip.startDate))} - ${escapeHtml(fmtDate(trip.endDate))} · ${trip.duration} ${escapeHtml(t("days"))}</p>
      <p>${trip.members.length} ${escapeHtml(t("members"))} · ${escapeHtml(t(getTripStatus(trip)))}</p>
    </section>

    ${sectionSet.has("overview") ? `<section class="section">
      <h2 class="section-title">${escapeHtml(t("overview"))}</h2>
      <div class="grid cols-3">
        <div class="tile"><div class="label">${escapeHtml(t("dates"))}</div><div class="value">${escapeHtml(fmtDate(trip.startDate))}
${escapeHtml(fmtDate(trip.endDate))}</div></div>
        <div class="tile"><div class="label">${escapeHtml(t("flightLegs"))}</div><div class="value">${escapeHtml(String(trip.flightLegs.length || 0))}</div></div>
        <div class="tile"><div class="label">${escapeHtml(t("hotelStays"))}</div><div class="value">${escapeHtml(String(trip.hotels.length || 0))}</div></div>
        <div class="tile"><div class="label">${escapeHtml(t("members"))}</div><div class="value">${escapeHtml(members.map(member=>dn(member)).join(", ") || "—")}</div></div>
        <div class="tile"><div class="label">${escapeHtml(t("countdown"))}</div><div class="value">${escapeHtml(tripCountdownLabel(trip.startDate, trip.endDate, t))}</div></div>
        <div class="tile"><div class="label">${escapeHtml(t("optionalPlaces"))}</div><div class="value">${escapeHtml(String(trip.optionalStops.length || 0))}</div></div>
      </div>
    </section>` : ""}

    ${sectionSet.has("flights") ? `<section class="section">
      <h2 class="section-title">${escapeHtml(t("flightLegs"))}</h2>
      <div class="card-grid">
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
      </div>
    </section>` : ""}

    ${sectionSet.has("hotels") ? `<section class="section">
      <h2 class="section-title">${escapeHtml(t("hotelStays"))}</h2>
      <div class="card-grid">
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
      </div>
    </section>` : ""}

    ${sectionSet.has("itinerary") ? `<section class="section">
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
    </section>` : ""}

    ${sectionSet.has("notes") ? `<section class="section">
      <h2 class="section-title">${escapeHtml(t("travelNotes"))}</h2>
      ${trip.travelNotes.length ? pdfList(trip.travelNotes.map(note=>`${note.authorName} — ${new Date(note.createdAt).toLocaleString()}${note.text ? ` • ${note.text}` : ""}`)) : `<p class="muted">${escapeHtml(t("noNotesDesc"))}</p>`}
    </section>` : ""}

    ${sectionSet.has("expenses") ? `<section class="section">
      <h2 class="section-title">${escapeHtml(t("expenses"))}</h2>
      <div class="grid cols-2">
        <div class="tile"><div class="label">${escapeHtml(t("totalSpent"))}</div><div class="value">${Object.keys(expenseTotalsByCurrency).length
          ? escapeHtml(Object.entries(expenseTotalsByCurrency).map(([currency,total])=>fmtCur(total,currency)).join(" · "))
          : "—"}</div></div>
        <div class="tile"><div class="label">${escapeHtml(t("members"))}</div><div class="value">${escapeHtml(String(trip.members.length))}</div></div>
      </div>
      ${trip.expenses.length ? pdfList(trip.expenses.map(expense=>`${fmtDate(expense.date)} • ${expense.title} • ${fmtCur(expense.amount, expense.currency)} • ${expense.category}`)) : `<p class="muted" style="margin-top:12px">${escapeHtml(t("noExpensesDesc"))}</p>`}
    </section>` : ""}

    ${sectionSet.has("luggage") ? `<section class="section">
      <h2 class="section-title">${escapeHtml(t("luggage"))}</h2>
      ${trip.packingList.length ? pdfList(trip.packingList.map(item=>`${item.label} (${item.category})${Object.values(item.packedBy ?? {}).some(Boolean) ? " ✓" : ""}`)) : `<p class="muted">${escapeHtml(t("noLuggageDesc"))}</p>`}
    </section>` : ""}
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
  return status === "upcoming" ? "amber" : status === "past" ? "slate" : "blue";
}

function formatForecastDate(date: string) {
  return new Date(date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

async function lookupLocation(siteCfg: SiteSettings, query: string): Promise<GeoPoint | null> {
  if (!query.trim()) return null;
  try {
    const gurl = withOptionalWeatherLanguage(buildUrl(siteCfg.weatherApi.geocodeUrl, { query }), query);
    const r = await fetch(gurl);
    const d = await r.json();
    const loc = d.results?.[0];
    if (!loc) return null;
    return { name: loc.name ?? query, lat: loc.latitude, lon: loc.longitude };
  } catch {
    return null;
  }
}

async function searchLocations(siteCfg: SiteSettings, query: string): Promise<GeoSearchResult[]> {
  if (!query.trim()) return [];
  try {
    const baseUrl = withOptionalWeatherLanguage(buildUrl(siteCfg.weatherApi.geocodeUrl, { query }), query);
    const url = baseUrl.includes("count=") ? baseUrl.replace(/count=\d+/,"count=8") : `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}count=8`;
    const r = await fetch(url);
    const d = await r.json();
    return (d.results ?? []).slice(0, 8).map((loc: Record<string, unknown>) => {
      const city = String(loc.name ?? query);
      const admin = String(loc.admin1 ?? loc.admin2 ?? "").trim();
      const country = String(loc.country ?? "").trim();
      const subtitle = [admin, country].filter(Boolean).join(", ");
      return {
        name: city,
        lat: Number(loc.latitude ?? 0),
        lon: Number(loc.longitude ?? 0),
        subtitle,
      };
    }).filter((loc: GeoSearchResult)=>Number.isFinite(loc.lat) && Number.isFinite(loc.lon));
  } catch {
    return [];
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

async function readImageFile(file:File,{maxDimension=1600,maxBytes=350_000}:{maxDimension?:number;maxBytes?:number}={}):Promise<string>{
  const raw = await readFile(file);
  if(file.type.startsWith("image/svg")) return raw;
  const img = await loadImageFromSource(raw);
  const scale = Math.min(1,maxDimension/Math.max(img.width,img.height));
  const width = Math.max(1,Math.round(img.width*scale));
  const height = Math.max(1,Math.round(img.height*scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if(!ctx) return raw;
  ctx.drawImage(img,0,0,width,height);

  let quality = 0.9;
  let compressed = canvas.toDataURL("image/jpeg",quality);
  while(compressed.length > maxBytes && quality > 0.35){
    quality = +(quality - 0.1).toFixed(2);
    compressed = canvas.toDataURL("image/jpeg",quality);
  }

  if(compressed.length > maxBytes){
    throw new Error("Banner image is too large. Please use a smaller image.");
  }
  return compressed;
}

function loadImageFromSource(src:string){
  return new Promise<HTMLImageElement>((resolve,reject)=>{
    const img = new Image();
    img.onload = ()=>resolve(img);
    img.onerror = ()=>reject(new Error("Failed to decode image."));
    img.src = src;
  });
}

function clampCropOffset(offset:number,imageEdge:number,canvasEdge:number){
  const maxOffset = Math.max(0,(imageEdge - canvasEdge)/2);
  return Math.max(-maxOffset,Math.min(maxOffset,offset));
}

async function renderCircularAvatar(source:string,{size=320,zoom=1,offsetX=0,offsetY=0,maxBytes=110_000}:{size?:number;zoom?:number;offsetX?:number;offsetY?:number;maxBytes?:number}={}){
  const img = await loadImageFromSource(source);
  const baseScale = size / Math.max(1,Math.min(img.width,img.height));
  const drawScale = Math.max(1,zoom) * baseScale;
  const drawW = img.width * drawScale;
  const drawH = img.height * drawScale;
  const clampedX = clampCropOffset(offsetX,drawW,size);
  const clampedY = clampCropOffset(offsetY,drawH,size);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if(!ctx) return source;
  ctx.save();
  ctx.beginPath();
  ctx.arc(size/2,size/2,size/2,0,Math.PI*2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(img,(size-drawW)/2 + clampedX,(size-drawH)/2 + clampedY,drawW,drawH);
  ctx.restore();

  let quality = 0.92;
  let compressed = canvas.toDataURL("image/jpeg",quality);
  while(compressed.length > maxBytes && quality > 0.35){
    quality = +(quality - 0.08).toFixed(2);
    compressed = canvas.toDataURL("image/jpeg",quality);
  }
  return compressed;
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
  return sortItineraryByDayAndTime(combined);
}

async function searchHotelByQuery(_siteCfg:SiteSettings,hotelName:string,location:string){
  const q=[hotelName,location].filter(Boolean).join(" ").trim();
  if(!q)return null;
  const mapSearchUrl=`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  if(typeof window!=="undefined"){
    window.open(mapSearchUrl,"_blank","noopener,noreferrer");
  }
  return {
    hotelName: hotelName.trim() || q,
    hotelAddress: location.trim() || q,
    contact: "",
    roomType: "",
  };
}

/* ═══════════════════════════════════════════════════════════════════════════════
   UI PRIMITIVES
   ═══════════════════════════════════════════════════════════════════════════════ */
function Input(p:InputHTMLAttributes<HTMLInputElement>&{label?:string;th:ThemeMode}){
  const{label,th,className,...rest}=p;
  const f=<input {...rest} className={cx("w-full max-w-full min-w-0 rounded-2xl border px-4 py-3 outline-none transition placeholder:opacity-50",
    th==="dark"?"border-white/10 bg-white/5 text-white focus:border-cyan-400/60":"border-slate-300 bg-white text-slate-900 focus:border-blue-500",className)}/>;
  if(!label)return f;
  return <label className="flex flex-col gap-2"><span className={th==="dark"?"text-slate-300":"text-slate-600"}>{label}</span>{f}</label>;
}

function Select(p:SelectHTMLAttributes<HTMLSelectElement>&{label?:string;th:ThemeMode;children:ReactNode}){
  const{label,th,className,children,...rest}=p;
  const f=<select {...rest} className={cx("tp-select w-full max-w-full min-w-0 rounded-2xl border px-4 py-3 outline-none transition shadow-sm",
    th==="dark"?"border-white/10 bg-slate-900 text-white focus:border-cyan-400/60":"border-slate-300 bg-white text-slate-900 focus:border-blue-500",className)}>{children}</select>;
  if(!label)return f;
  return <label className="flex flex-col gap-2"><span className={th==="dark"?"text-slate-300":"text-slate-600"}>{label}</span>{f}</label>;
}

function Textarea(p:TextareaHTMLAttributes<HTMLTextAreaElement>&{label?:string;th:ThemeMode}){
  const{label,th,className,...rest}=p;
  const f=<textarea {...rest} className={cx("w-full max-w-full min-w-0 rounded-2xl border px-4 py-3 outline-none transition placeholder:opacity-50 min-h-24 resize-none",
    th==="dark"?"border-white/10 bg-white/5 text-white focus:border-cyan-400/60":"border-slate-300 bg-white text-slate-900 focus:border-blue-500",className)}/>;
  if(!label)return f;
  return <label className="flex flex-col gap-2"><span className={th==="dark"?"text-slate-300":"text-slate-600"}>{label}</span>{f}</label>;
}

function Btn(p:ButtonHTMLAttributes<HTMLButtonElement>&{th:ThemeMode;v?:"pri"|"sec"|"ghost"|"danger";sz?:"sm"|"md"}){
  const{th,v="pri",sz="md",className,...rest}=p;
  return <button {...rest} className={cx("rounded-full font-medium transition disabled:opacity-40 whitespace-nowrap active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400/70",
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
  const c={blue:"bg-blue-500/15 text-blue-400",green:"bg-emerald-500/15 text-emerald-400",amber:th==="dark"?"bg-amber-300 text-slate-950 ring-1 ring-amber-200/80 shadow-lg shadow-amber-400/25":"bg-amber-600 text-white ring-1 ring-amber-500/60",
    rose:"bg-rose-500/15 text-rose-400",slate:th==="dark"?"bg-white/8 text-slate-300":"bg-slate-100 text-slate-600"};
  return <span className={cx("rounded-full px-3 py-1 text-sm font-medium",c[color])}>{label}</span>;
}

function Tabs<T extends string>({tabs,active,onChange,th}:{tabs:{id:T;label:string;icon?:string}[];active:T;onChange:(id:T)=>void;th:ThemeMode}){
  return <div className={cx("flex w-full min-w-0 gap-1 rounded-2xl p-1 overflow-x-auto",th==="dark"?"bg-white/5":"bg-slate-200/60")}>
    {tabs.map(t=><button key={t.id} onClick={()=>onChange(t.id)} className={cx(
      "flex shrink-0 items-center gap-2 rounded-xl px-5 py-2.5 font-medium whitespace-nowrap transition-all",
      active===t.id?(th==="dark"?"bg-white/10 text-white shadow-sm":"bg-white text-slate-900 shadow-sm")
        :(th==="dark"?"text-slate-400 hover:text-slate-200":"text-slate-500 hover:text-slate-800")
    )}>{t.icon&&<span className="text-lg">{t.icon}</span>}{t.label}</button>)}
  </div>;
}

function Modal({open,onClose,th,children,title,size="md",mobileFullscreen=false}:{open:boolean;onClose:()=>void;th:ThemeMode;children:ReactNode;title?:string;size?:"md"|"xl"|"full";mobileFullscreen?:boolean;}){
  if(!open)return null;
  const widthClass=size==="full"?"max-w-6xl":size==="xl"?"max-w-4xl":"max-w-lg";
  return <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"/>
    <motion.div initial={{opacity:0,scale:.96}} animate={{opacity:1,scale:1}} exit={{opacity:0,scale:.96}}
      className={cx("relative z-10 w-full border p-5 shadow-2xl overflow-y-auto sm:p-8",
        widthClass,
        mobileFullscreen?"h-[100dvh] rounded-none sm:h-auto sm:max-h-[90vh] sm:rounded-3xl":"max-h-[90vh] rounded-3xl",
        th==="dark"?"border-white/10 bg-slate-900":"border-slate-200 bg-white")}
      onClick={e=>e.stopPropagation()}>
      {title&&<div className="mb-4 flex items-center justify-between sm:mb-6">
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

function Avatar({name,th,icon,iconImage}:{name:string;th:ThemeMode;icon?:string;iconImage?:string}){
  const ini=name.split(" ").map(w=>w[0]?.toUpperCase()||"").slice(0,2).join("");
  return <div className={cx("w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg overflow-hidden",
    th==="dark"?"bg-cyan-400/20 text-cyan-300":"bg-blue-100 text-blue-700")}>
    {iconImage?.trim()
      ? <img src={iconImage} alt={`${name} avatar`} className="h-full w-full object-cover"/>
      : (icon?.trim() ? <span className="text-2xl leading-none">{icon.trim()}</span> : ini)}
  </div>;
}

function AvatarPicker({th,t,label,emojiValue,imageValue,onEmojiChange,onImageChange}:{th:ThemeMode;t:(k:TKey)=>string;label:string;emojiValue:string;imageValue?:string;onEmojiChange:(value:string)=>void;onImageChange:(value:string)=>void}){
  const [avatarSize,setAvatarSize]=useState(320);
  const PREVIEW_SIZE = 220;
  const [sourceImage,setSourceImage]=useState<string>("");
  const [sourceMeta,setSourceMeta]=useState<{width:number;height:number}|null>(null);
  const [zoom,setZoom]=useState(1);
  const [offsetX,setOffsetX]=useState(0);
  const [offsetY,setOffsetY]=useState(0);
  const dragState = useRef<{startX:number;startY:number;baseX:number;baseY:number;pointerId:number}|null>(null);
  const getOffsetLimit = useCallback((meta:{width:number;height:number}|null,nextZoom:number)=>{
    if(!meta) return {x:0,y:0};
    const baseScale = PREVIEW_SIZE / Math.max(1,Math.min(meta.width,meta.height));
    const drawW = meta.width * baseScale * nextZoom;
    const drawH = meta.height * baseScale * nextZoom;
    return {
      x:Math.max(0,(drawW-PREVIEW_SIZE)/2),
      y:Math.max(0,(drawH-PREVIEW_SIZE)/2),
    };
  },[]);
  const clampOffsets = useCallback((nextX:number,nextY:number,nextZoom=zoom)=>{
    const limit = getOffsetLimit(sourceMeta,nextZoom);
    return {
      x: Math.max(-limit.x,Math.min(limit.x,nextX)),
      y: Math.max(-limit.y,Math.min(limit.y,nextY)),
    };
  },[getOffsetLimit,sourceMeta,zoom]);
  const processImage = useCallback(async(source:string,size:number,cropZoom:number,cropX:number,cropY:number)=>{
    const resized = await renderCircularAvatar(source,{size,zoom:cropZoom,offsetX:cropX,offsetY:cropY,maxBytes:110_000});
    onImageChange(resized);
  },[onImageChange]);
  const handleUpload = async(e:ChangeEvent<HTMLInputElement>)=>{
    const file = e.target.files?.[0];
    if(!file) return;
    const raw = await readFile(file);
    setSourceImage(raw);
    setZoom(1);
    setOffsetX(0);
    setOffsetY(0);
    e.target.value = "";
  };
  useEffect(()=>{
    if(!sourceImage){
      setSourceMeta(null);
      return;
    }
    void loadImageFromSource(sourceImage).then(img=>setSourceMeta({width:img.width,height:img.height})).catch(()=>setSourceMeta(null));
  },[sourceImage]);
  useEffect(()=>{
    if(!sourceImage) return;
    const clamped = clampOffsets(offsetX,offsetY,zoom);
    if(clamped.x!==offsetX) setOffsetX(clamped.x);
    if(clamped.y!==offsetY) setOffsetY(clamped.y);
    void processImage(sourceImage,avatarSize,zoom,clamped.x,clamped.y);
  },[avatarSize,clampOffsets,offsetX,offsetY,processImage,sourceImage,zoom]);
  return <div className="space-y-3">
    <span className={th==="dark"?"text-slate-300":"text-slate-600"}>{label}</span>
    <div className="flex flex-wrap gap-2">
      {AVATAR_EMOJI_OPTIONS.map(emoji=><button key={emoji} type="button" onClick={()=>onEmojiChange(emoji)} className={cx(
        "h-10 w-10 rounded-xl border text-lg transition active:scale-95",
        emojiValue===emoji ? (th==="dark"?"border-cyan-300 bg-cyan-400/25":"border-blue-500 bg-blue-100") : (th==="dark"?"border-white/10 bg-white/5":"border-slate-300 bg-white")
      )}>{emoji}</button>)}
      <button type="button" onClick={()=>onEmojiChange("")} className={cx("rounded-xl border px-3 text-xs transition active:scale-95",th==="dark"?"border-white/10 bg-white/5":"border-slate-300 bg-white")}>Clear</button>
    </div>
    <div className="flex flex-wrap items-center gap-3">
      <label className={cx("file-label",th==="dark"?"bg-white/5 text-slate-300 hover:bg-white/10":"bg-slate-100 text-slate-700 hover:bg-slate-200")}>
        🖼 {t("uploadIcon")}
        <input type="file" accept="image/*" onChange={handleUpload}/>
      </label>
      {imageValue?.trim()&&<button type="button" onClick={()=>onImageChange("")} className={cx("rounded-full px-3 py-1 text-sm",th==="dark"?"bg-rose-500/15 text-rose-300":"bg-rose-50 text-rose-600")}>{t("removeImage")}</button>}
    </div>
    <label className="flex items-center gap-3 text-sm">
      <span className={th==="dark"?"text-slate-400":"text-slate-600"}>{t("resize")}</span>
      <input type="range" min={96} max={512} step={16} value={avatarSize} onChange={e=>setAvatarSize(Number(e.target.value)||320)} className="flex-1"/>
      <span className={th==="dark"?"text-slate-300":"text-slate-700"}>{avatarSize}px</span>
    </label>
    {sourceImage&&<div className="space-y-3">
      <label className="flex items-center gap-3 text-sm">
        <span className={th==="dark"?"text-slate-400":"text-slate-600"}>{t("zoom")}</span>
        <input type="range" min={1} max={3} step={0.05} value={zoom} onChange={e=>{
          const nextZoom = Number(e.target.value) || 1;
          const clamped = clampOffsets(offsetX,offsetY,nextZoom);
          setZoom(nextZoom);
          setOffsetX(clamped.x);
          setOffsetY(clamped.y);
        }} className="flex-1"/>
        <span className={th==="dark"?"text-slate-300":"text-slate-700"}>{zoom.toFixed(2)}x</span>
      </label>
      <div>
        <p className={cx("mb-2 text-xs",th==="dark"?"text-slate-400":"text-slate-500")}>Drag image to adjust circular extraction.</p>
        <div
          className={cx("relative mx-auto overflow-hidden rounded-full border-2 touch-none",th==="dark"?"border-cyan-300/70 bg-black/20":"border-slate-400 bg-slate-100")}
          style={{width:PREVIEW_SIZE,height:PREVIEW_SIZE}}
          onPointerDown={e=>{
            dragState.current = {startX:e.clientX,startY:e.clientY,baseX:offsetX,baseY:offsetY,pointerId:e.pointerId};
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={e=>{
            if(!dragState.current || dragState.current.pointerId!==e.pointerId) return;
            const dx = e.clientX - dragState.current.startX;
            const dy = e.clientY - dragState.current.startY;
            const clamped = clampOffsets(dragState.current.baseX + dx,dragState.current.baseY + dy);
            setOffsetX(clamped.x);
            setOffsetY(clamped.y);
          }}
          onPointerUp={e=>{
            if(dragState.current?.pointerId===e.pointerId){
              e.currentTarget.releasePointerCapture(e.pointerId);
              dragState.current = null;
            }
          }}
          onPointerCancel={()=>{dragState.current = null;}}
        >
          {sourceMeta&&<img
            src={sourceImage}
            alt="Avatar crop source"
            draggable={false}
            className="pointer-events-none select-none absolute max-w-none"
            style={{
              width:sourceMeta.width * (PREVIEW_SIZE / Math.max(1,Math.min(sourceMeta.width,sourceMeta.height))) * zoom,
              height:sourceMeta.height * (PREVIEW_SIZE / Math.max(1,Math.min(sourceMeta.width,sourceMeta.height))) * zoom,
              left:"50%",
              top:"50%",
              transform:`translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))`,
            }}
          />}
        </div>
      </div>
    </div>}
    {(emojiValue || imageValue) && <div className="flex items-center gap-3">
      <Avatar name="Preview User" icon={emojiValue} iconImage={imageValue} th={th}/>
      <p className={cx("text-sm",th==="dark"?"text-slate-400":"text-slate-500")}>{t("preview")}</p>
    </div>}
  </div>;
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
    <div className="max-w-7xl mx-auto px-4 py-3 sm:px-6 sm:py-4 flex flex-wrap items-center justify-between gap-2">
      <h1 className="text-xl sm:text-2xl font-bold cursor-pointer break-words" onClick={()=>setView("user")}>✈ {siteName}</h1>
      <div className="flex w-full sm:w-auto min-w-0 items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
        <label className={cx("flex items-center gap-2 rounded-full border pl-3 pr-2 py-1.5 text-sm shrink-0",
          th==="dark"?"border-white/15 bg-white/5 text-slate-200":"border-slate-300 bg-white text-slate-700")}>
          <span>🌐</span>
          <select value={lang} onChange={e=>setLang(e.target.value as Language)}
            className={cx("bg-transparent outline-none font-medium pr-4",
              th==="dark"?"text-white":"text-slate-900")}>
            <option value="en" className="text-slate-900">{t("english")}</option>
            <option value="zh" className="text-slate-900">{t("chinese")}</option>
          </select>
        </label>
        <button onClick={()=>setTh(th==="dark"?"light":"dark")}
          className={cx("w-10 h-10 rounded-full flex items-center justify-center text-xl transition",
            th==="dark"?"bg-white/5 hover:bg-white/10":"bg-slate-100 hover:bg-slate-200")}>
          {th==="dark"?"☀️":"🌙"}
        </button>
        <Btn th={th} v="ghost" sz="sm" onClick={onSync} disabled={isSyncing} className="shrink-0">
          {isSyncing ? "Syncing…" : "Sync now"}
        </Btn>
        {view==="user"&&<Btn th={th} v="ghost" sz="sm" onClick={()=>setView("admin")} className="shrink-0">{t("admin")}</Btn>}
        {view==="admin"&&user&&<Btn th={th} v="ghost" sz="sm" onClick={()=>setView("user")} className="shrink-0">{t("myTrips")}</Btn>}
        {user?<>
          <div className="hidden sm:flex items-center gap-2 pl-3 border-l"
            style={{borderColor:th==="dark"?"rgba(255,255,255,0.1)":"rgba(0,0,0,0.1)"}}>
            <Avatar name={dn(user)} icon={user.icon} iconImage={user.iconImage} th={th}/>
            <span className="font-medium hidden sm:inline">{dn(user)}</span>
          </div>
          <Btn th={th} v="sec" sz="sm" onClick={onLogout} className="shrink-0">{t("signOut")}</Btn>
        </>:<Btn th={th} sz="sm" onClick={onSignIn} className="shrink-0">{t("signIn")}</Btn>}
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
    dateOfBirth:"",nationality:"",passportNumber:"",passportExpiryDate:"",dietaryNotes:"",emergencyContact:"",homeAirport:"HKG",icon:"",iconImage:""});
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
      dietaryNotes:form.dietaryNotes.trim(),emergencyContact:form.emergencyContact.trim(),homeAirport:normalizeAirport(form.homeAirport)||"HKG",
      icon:form.icon.trim(),
      iconImage:form.iconImage,
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
          <AvatarPicker
            th={th}
            t={t}
            label={t("profileIcon")}
            emojiValue={form.icon}
            imageValue={form.iconImage}
            onEmojiChange={value=>setForm(f=>({...f,icon:value,iconImage:value? "" : f.iconImage}))}
            onImageChange={value=>setForm(f=>({...f,iconImage:value,icon:value? "" : f.icon}))}
          />
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
function UserWorkspace({user,trips,profiles,siteCfg,th,t,onUpdate,onCreate,onJoin,onLeaveTrip,onTripUpdate,onDeleteTrip,onAddExp,onUpdateExp,onAddPack,onTogglePack,onRemovePack,onAddSharedPack,onRemoveSharedPack,onUpdateItin,onRemoveExp}:{
  user:Profile;trips:Trip[];profiles:Profile[];siteCfg:SiteSettings;th:ThemeMode;t:(k:TKey)=>string;
  onUpdate:(d:Partial<Profile>)=>void;onCreate:(d:{title:string;location:string;startDate:string;endDate:string})=>void;
  onJoin:(code:string)=>{ok:boolean;message:string};onTripUpdate:(id:string,d:Partial<Trip>)=>void;
  onLeaveTrip:(tripId:string)=>void;
  onDeleteTrip:(id:string)=>void;
  onAddExp:(tid:string,e:Omit<Expense,"id">)=>void;onAddPack:(tid:string,l:string,cat:string)=>void;
  onUpdateExp:(tid:string,eid:string,e:Omit<Expense,"id">)=>void;
  onTogglePack:(tid:string,iid:string)=>void;onRemovePack:(tid:string,iid:string)=>void;
  onAddSharedPack:(tid:string,l:string,cat:string)=>void;onRemoveSharedPack:(tid:string,iid:string)=>void;
  onUpdateItin:(tid:string,items:ItineraryItem[])=>void;onRemoveExp:(tid:string,eid:string)=>void;
}){
  const [section,setSection]=useState<UserSection>("trips");
  const [activeTrip,setActiveTrip]=useState<string|null>(null);

  const myTrips=useMemo(()=>trips.filter(t=>t.members.includes(user.id)).sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime()),[trips,user.id]);
  const trip=activeTrip?myTrips.find(t=>t.id===activeTrip):null;

  return <div className="mobile-tight max-w-7xl mx-auto px-4 py-5 sm:px-6 sm:py-8 space-y-4 sm:space-y-6">
    <Tabs tabs={[{id:"dashboard" as const,label:t("dashboard"),icon:"📊"},{id:"trips" as const,label:t("myTrips"),icon:"✈️"}]}
      active={section} onChange={setSection} th={th}/>

    {section==="dashboard"&&<Dashboard user={user} trips={myTrips} th={th} t={t} onUpdate={onUpdate} onSelectTrip={id=>{setActiveTrip(id);setSection("trips");}}/>}

    {section==="trips"&&<>
      {!trip?<TripSelector trips={myTrips} th={th} t={t} onCreate={onCreate} onJoin={onJoin} onSelect={setActiveTrip}/>
      :<TripDetail trip={trip} user={user} profiles={profiles} siteCfg={siteCfg} th={th} t={t} onBack={()=>setActiveTrip(null)}
        onUpdate={onTripUpdate} onDeleteTrip={onDeleteTrip} onAddExp={onAddExp} onAddPack={onAddPack} onTogglePack={onTogglePack} onRemovePack={onRemovePack}
        onAddSharedPack={onAddSharedPack} onRemoveSharedPack={onRemoveSharedPack}
        onUpdateItin={onUpdateItin} onRemoveExp={onRemoveExp} onUpdateExp={onUpdateExp} onLeaveTrip={onLeaveTrip}/>}
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
          <Avatar name={dn(user)} icon={user.icon} iconImage={user.iconImage} th={th}/>
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
          <InfoRow label={t("profileIcon")} value={user.icon || "—"} th={th}/>
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
        <AvatarPicker
          th={th}
          t={t}
          label={t("profileIcon")}
          emojiValue={form.icon||""}
          imageValue={form.iconImage||""}
          onEmojiChange={value=>setForm(f=>({...f,icon:value,iconImage:value? "" : (f.iconImage||"")}))}
          onImageChange={value=>setForm(f=>({...f,iconImage:value,icon:value? "" : (f.icon||"")}))}
        />
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
              <p className={cx("mt-1 text-xs font-semibold",th==="dark"?"text-cyan-300":"text-blue-700")}>{tripCountdownLabel(tr.startDate, tr.endDate, t)}</p>
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
      <p className={cx("text-sm font-semibold",status==="upcoming"?(th==="dark"?"text-amber-300":"text-amber-700"):status==="past"?(th==="dark"?"text-slate-400":"text-slate-600"):"text-cyan-400")}>{t("status")}: {t(status)}</p>
      <p className={cx("text-sm font-medium",th==="dark"?"text-cyan-300":"text-blue-700")}>
        ⏳ {tripCountdownLabel(trip.startDate, trip.endDate, t)}
      </p>
      <p className={cx("text-sm",th==="dark"?"text-slate-400":"text-slate-500")}>
        👥 {trip.members.length} {t("members")} · {trip.duration} {t("days")}
      </p>
    </div>
  </Card>;
}

function TripDetail({trip,user,profiles,siteCfg,th,t,onBack,onUpdate,onDeleteTrip,onAddExp,onUpdateExp,onAddPack,onTogglePack,onRemovePack,onAddSharedPack,onRemoveSharedPack,onUpdateItin,onRemoveExp,onLeaveTrip,readOnly=false}:{
  trip:Trip;user:Profile;profiles:Profile[];siteCfg:SiteSettings;th:ThemeMode;t:(k:TKey)=>string;onBack:()=>void;
  onUpdate:(id:string,d:Partial<Trip>)=>void;onDeleteTrip:(id:string)=>void;onAddExp:(tid:string,e:Omit<Expense,"id">)=>void;
  onUpdateExp:(tid:string,eid:string,e:Omit<Expense,"id">)=>void;
  onAddPack:(tid:string,l:string,cat:string)=>void;onTogglePack:(tid:string,iid:string)=>void;
  onAddSharedPack:(tid:string,l:string,cat:string)=>void;onRemoveSharedPack:(tid:string,iid:string)=>void;
  onRemovePack:(tid:string,iid:string)=>void;onUpdateItin:(tid:string,items:ItineraryItem[])=>void;
  onRemoveExp:(tid:string,eid:string)=>void;
  onLeaveTrip:(tripId:string)=>void;
  readOnly?: boolean;
}){
  const [tab,setTab]=useState<TripTab>("overview");
  const [copyState,setCopyState]=useState<"idle"|"ok"|"fail">("idle");
  const role=getTripRole(trip,user.id);
  const isOwner=role==="owner";
  const canManageSettings=!readOnly&&canEditSettings(role);
  const canManageItinerary=!readOnly&&canEditItinerary(role);
  const canManageExpenses=!readOnly&&canEditExpenses(role);
  const status=getTripStatus(trip);
  const isPortraitMobile=usePortraitMobile();
  const isMobileScreen=useMobileScreen();

  const tripTabs:{id:TripTab;label:string;icon:string}[]=[
    {id:"overview",label:t("overview"),icon:"📋"},{id:"travelers",label:t("travelers"),icon:"👥"},{id:"itinerary",label:t("itinerary"),icon:"🗓️"},
    {id:"expenses",label:t("expenses"),icon:"💰"},{id:"luggage",label:t("luggage"),icon:"🧳"},
    {id:"settings",label:t("settings"),icon:"⚙️"},{id:"instructions",label:t("instructions"),icon:"📘"},
  ];

  return <div className={cx("space-y-6",isPortraitMobile&&"space-y-4")}>
    <div className="flex items-center gap-4">
      <Btn th={th} v="ghost" sz="sm" onClick={onBack}>← {t("back")}</Btn>
    </div>

    {/* TRIP HEADER */}
    <div className={cx("relative overflow-hidden rounded-3xl",isPortraitMobile&&"rounded-2xl")} style={{minHeight:isPortraitMobile?"220px":"280px"}}>
      <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-purple-600" style={{background:trip.bannerImage?`url(${trip.bannerImage}) center/cover`:trip.bannerColor}}/>
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent"/>
      <div className="relative z-10 p-5 text-white sm:p-10">
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <Badge label={`${t("status")}: ${t(status)}`} th={th} color={getStatusColor(status)}/>
          <button onClick={async()=>{const ok=await copyText(trip.id);setCopyState(ok?"ok":"fail");setTimeout(()=>setCopyState("idle"),1500);}} className={cx("flex items-center gap-2 rounded-full px-3 py-2 text-sm transition active:scale-95 sm:px-4 sm:text-base",copyState==="ok"?"bg-emerald-400/30":"bg-white/20 hover:bg-white/30")}>
            📋 {trip.id} <span className="text-sm opacity-75">({copyState==="ok"?"Copied ✓":copyState==="fail"?"Copy failed":t("copyId")})</span>
          </button>
        </div>
        <h1 className="mb-3 text-3xl font-black sm:text-5xl">{trip.title}</h1>
        <p className="mb-6 text-lg sm:text-2xl">📍 {trip.location}</p>
        <div className={cx("flex flex-wrap gap-3 text-sm sm:gap-4 sm:text-lg",isPortraitMobile&&"grid grid-cols-2 gap-2 text-sm")}>
          <span>📅 {fmtDate(trip.startDate)} – {fmtDate(trip.endDate)}</span>
          <span>⏱️ {trip.duration} {t("days")}</span>
          <span>👥 {trip.members.length} {t("members")}</span>
          <span>🧭 {t(status)}</span>
          <span>⏳ {tripCountdownLabel(trip.startDate, trip.endDate, t)}</span>
        </div>
      </div>
    </div>

    {isMobileScreen
      ? <Select th={th} label={t("section")} value={tab} onChange={e=>setTab(e.target.value as TripTab)}>
          {tripTabs.map(item=><option key={item.id} value={item.id}>{item.icon} {item.label}</option>)}
        </Select>
      : <Tabs tabs={tripTabs} active={tab} onChange={setTab} th={th}/>}

    {tab==="overview"&&<TripOverview trip={trip} user={user} profiles={profiles} siteCfg={siteCfg} canEdit={!readOnly} th={th} t={t} onUpdate={onUpdate}/>} 
    {tab==="travelers"&&<TripTravelers trip={trip} user={user} profiles={profiles} th={th} t={t} onUpdateTrip={onUpdate}/>} 
    {tab==="itinerary"&&<TripItinerary trip={trip} user={user} profiles={profiles} canEdit={canManageItinerary} canEditFreeTime={!readOnly} th={th} t={t} onUpdate={onUpdateItin} onTripUpdate={onUpdate}/>}
    {tab==="expenses"&&<TripExpenses trip={trip} user={user} canEdit={canManageExpenses} profiles={profiles} th={th} t={t} onAdd={onAddExp} onUpdateExpense={onUpdateExp} onRemove={onRemoveExp}/>}
    {tab==="luggage"&&<TripLuggage trip={trip} user={user} isOwner={isOwner} siteCfg={siteCfg} th={th} t={t} onAdd={onAddPack} onToggle={onTogglePack} onRemove={onRemovePack} onAddShared={onAddSharedPack} onRemoveShared={onRemoveSharedPack}/>}
    {tab==="settings"&&<TripSettings trip={trip} profiles={profiles} canEdit={canManageSettings} isOwner={isOwner} siteCfg={siteCfg} th={th} t={t} onUpdate={onUpdate} onDeleteTrip={onDeleteTrip} onBack={onBack} onLeaveTrip={onLeaveTrip}/>}
    {tab==="instructions"&&<TripInstructions th={th} t={t}/>}
  </div>;
}

function TripOverview({trip,user,profiles,siteCfg,canEdit,th,t,onUpdate}:{trip:Trip;user:Profile;profiles:Profile[];siteCfg:SiteSettings;canEdit:boolean;th:ThemeMode;t:(k:TKey)=>string;onUpdate:(id:string,d:Partial<Trip>)=>void}){
  const [weather,setWeather]=useState<WeatherData|null>(null);
  const [loading,setLoading]=useState(false);
  const [showCustomLoc,setShowCustomLoc]=useState(false);
  const [customForm,setCustomForm]=useState({query:"",selected:null as GeoSearchResult|null,startDay:1,endDay:Math.max(1,trip.duration)});
  const [searchingLocation,setSearchingLocation]=useState(false);
  const [searchResults,setSearchResults]=useState<GeoSearchResult[]>([]);
  const [selectedWeatherLocationId,setSelectedWeatherLocationId]=useState("");
  const [noteText,setNoteText]=useState("");
  const [noteFiles,setNoteFiles]=useState<{url:string;name:string}[]>([]);
  const [urlInput,setUrlInput]=useState("");
  const [editingNoteId,setEditingNoteId]=useState<string|null>(null);
  const [editingNoteText,setEditingNoteText]=useState("");
  const [showPdfModal,setShowPdfModal]=useState(false);
  const [copyState,setCopyState]=useState<"idle"|"ok"|"fail">("idle");
  const [pdfSections,setPdfSections]=useState<PdfSectionId[]>(()=>PDF_SECTION_ORDER.map(section=>section.id));

  const memberProfiles=trip.members.map(id=>profiles.find(profile=>profile.id===id)).filter(Boolean) as Profile[];
  const togglePdfSection = (sectionId: PdfSectionId)=>{
    setPdfSections(current=>current.includes(sectionId) ? current.filter(id=>id!==sectionId) : [...current,sectionId]);
  };
  const runPdfExport = ()=>{
    const sections: PdfSectionId[] = pdfSections.length ? pdfSections : ["overview"];
    exportTripToPdf(trip, memberProfiles, t, sections);
    setShowPdfModal(false);
  };
  const flightLegs=trip.flightLegs.length>0?trip.flightLegs:[{
    id:"legacy-flight",airline:trip.airline,flightNumber:trip.flightNumber,departureAirport:trip.departureAirport,arrivalAirport:trip.arrivalAirport,
    departureTime:trip.departureTime,arrivalTime:trip.arrivalTime,terminal:trip.terminal,bookingReference:trip.bookingReference,notes:"",
  }].filter(leg=>Object.values(leg).some(Boolean));
  const hotels=trip.hotels.length>0?trip.hotels:[{
    id:"legacy-hotel",hotelName:trip.hotelName,hotelAddress:trip.hotelAddress,roomType:trip.roomType,checkIn:trip.checkIn,checkOut:trip.checkOut,confirmationCode:trip.confirmationCode,contact:"",notes:"",
  }].filter(stay=>Object.values(stay).some(Boolean));
  const status=getTripStatus(trip);
  const isMobileScreen=useMobileScreen();
  const [mobileSection,setMobileSection]=useState<"flight"|"hotel"|"notes"|"weather">("flight");
  const activeWeatherPlan = useMemo(()=>{
    const plans = [...(trip.weatherLocations ?? [])].sort((a,b)=>a.startDay-b.startDay);
    if(plans.length===0) return null;
    return plans.find(item=>item.id===selectedWeatherLocationId) ?? plans[0];
  },[trip.weatherLocations,selectedWeatherLocationId]);

  const loadWeather=async(point?:GeoPoint|null)=>{
    setLoading(true);
    try{
      const resolved=point
        ?? activeWeatherPlan?.location
        ?? (trip.customLocation ? {name:trip.customLocation.name,lat:trip.customLocation.lat,lon:trip.customLocation.lon} : await lookupLocation(siteCfg,trip.location));
      if(!resolved){setWeather(null);return;}
      setWeather(await fetchForecast(siteCfg,resolved));
    }finally{setLoading(false);}
  };

  const runLocationSearch=async()=>{
    if(!customForm.query.trim()) return;
    setSearchingLocation(true);
    setSearchResults(await searchLocations(siteCfg, customForm.query));
    setSearchingLocation(false);
  };

  const setCustomLocation=()=>{
    if(!canEdit) return;
    if(!customForm.selected) return;
    const nextPlan = {
      id: uid("wloc"),
      label: `${customForm.selected.name}${customForm.selected.subtitle ? ` (${customForm.selected.subtitle})` : ""}`,
      startDay: Math.max(1, Math.min(customForm.startDay, trip.duration)),
      endDay: Math.max(1, Math.min(customForm.endDay, trip.duration)),
      location: { name: customForm.selected.name, lat: customForm.selected.lat, lon: customForm.selected.lon },
    };
    const normalized = {
      ...nextPlan,
      startDay: Math.min(nextPlan.startDay, nextPlan.endDay),
      endDay: Math.max(nextPlan.startDay, nextPlan.endDay),
    };
    const weatherLocations = [...(trip.weatherLocations ?? []), normalized].sort((a,b)=>a.startDay-b.startDay);
    onUpdate(trip.id,{weatherLocations,customLocation:normalized.location});
    setSelectedWeatherLocationId(normalized.id);
    void loadWeather(normalized.location);
    setCustomForm({query:"",selected:null,startDay:1,endDay:Math.max(1,trip.duration)});
    setSearchResults([]);
    setShowCustomLoc(false);
  };

  const removeWeatherPlan=(planId:string)=>{
    if(!canEdit) return;
    const next = (trip.weatherLocations ?? []).filter(item=>item.id!==planId);
    onUpdate(trip.id,{weatherLocations:next.length?next:undefined});
    setSelectedWeatherLocationId(next[0]?.id ?? "");
  };

  useEffect(()=>{ void loadWeather(); },[trip.id,trip.location,trip.customLocation?.lat,trip.customLocation?.lon,activeWeatherPlan?.id,siteCfg.weatherApi.forecastUrl,siteCfg.weatherApi.geocodeUrl]);
  useEffect(()=>{
    if(!trip.weatherLocations?.length){ setSelectedWeatherLocationId(""); return; }
    if(!trip.weatherLocations.find(item=>item.id===selectedWeatherLocationId)){
      setSelectedWeatherLocationId(trip.weatherLocations[0].id);
    }
  },[trip.weatherLocations,selectedWeatherLocationId]);

  const addNote=()=>{
    if(!canEdit) return;
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

  const removeNote=(nid:string)=>{
    if(!canEdit) return;
    onUpdate(trip.id,{travelNotes:trip.travelNotes.filter(n=>n.id!==nid)});
  };

  const startEditNote=(note:TravelNote)=>{
    if(!canEdit) return;
    setEditingNoteId(note.id);
    setEditingNoteText(note.text ?? "");
  };

  const saveEditedNote=()=>{
    if(!canEdit || !editingNoteId) return;
    onUpdate(trip.id,{travelNotes:trip.travelNotes.map(note=>note.id===editingNoteId?{...note,text:editingNoteText.trim()}:note)});
    setEditingNoteId(null);
    setEditingNoteText("");
  };

  const showFlightSection=!isMobileScreen||mobileSection==="flight";
  const showHotelSection=!isMobileScreen||mobileSection==="hotel";
  const showNotesSection=!isMobileScreen||mobileSection==="notes";
  const showWeatherSection=!isMobileScreen||mobileSection==="weather";

  return <div className="grid min-w-0 xl:grid-cols-[minmax(0,1.65fr)_minmax(280px,340px)] gap-4 sm:gap-6">
    <div className="space-y-6">
      <Card th={th} className="p-5 sm:p-8 lg:p-10">
        <div className="grid min-w-0 lg:grid-cols-[1.15fr_.85fr] gap-5 sm:gap-8">
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-3">
              <Badge label={`${t("status")}: ${t(status)}`} th={th} color={getStatusColor(status)}/>
              <Badge label={`${trip.duration} ${t("days")}`} th={th} color="blue"/>
              <Btn th={th} v="sec" sz="sm" onClick={()=>setShowPdfModal(true)}>🧾 {t("exportPdf")}</Btn>
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
                <p className={cx("text-sm",th==="dark"?"text-slate-400":"text-slate-500")}>{t("countdown")}</p>
                <p className="mt-2 text-lg font-semibold">{tripCountdownLabel(trip.startDate, trip.endDate, t)}</p>
              </div>
              <div className={cx("rounded-3xl p-5",th==="dark"?"bg-white/[0.04]":"bg-slate-100")}>
                <p className={cx("text-sm",th==="dark"?"text-slate-400":"text-slate-500")}>{t("members")}</p>
                <p className="mt-2 text-3xl font-bold">{memberProfiles.length}</p>
              </div>
              <div className={cx("rounded-3xl p-5",th==="dark"?"bg-white/[0.04]":"bg-slate-100")}>
                <p className={cx("text-sm",th==="dark"?"text-slate-400":"text-slate-500")}>{t("flightDetails")}</p>
                <p className="mt-2 text-lg font-semibold">{flightLegs.map(leg=>leg.flightNumber).filter(Boolean).join(", ") || "—"}</p>
              </div>
            </div>
          </div>

          <div className={cx("rounded-[2rem] border p-6",th==="dark"?"border-white/8 bg-white/[0.03]":"border-slate-200 bg-slate-50")}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className={cx("text-sm uppercase tracking-[0.2em]",th==="dark"?"text-slate-400":"text-slate-500")}>{t("members")}</p>
                <p className="mt-2 text-2xl font-bold">{memberProfiles.length}</p>
              </div>
              <button onClick={async()=>{const ok=await copyText(trip.id);setCopyState(ok?"ok":"fail");setTimeout(()=>setCopyState("idle"),1400);}} className={cx("rounded-full px-4 py-2 text-sm font-semibold transition active:scale-95",copyState==="ok"?(th==="dark"?"bg-emerald-400/25 text-emerald-200":"bg-emerald-100 text-emerald-700"):(th==="dark"?"bg-cyan-400/15 text-cyan-300 hover:bg-cyan-400/25":"bg-blue-100 text-blue-700 hover:bg-blue-200"))}>
                {trip.id} · {copyState==="ok"?"Copied ✓":copyState==="fail"?"Copy failed":t("copyId")}
              </button>
            </div>
            <div className="mt-6 space-y-3">
              {memberProfiles.map(member=><div key={member.id} className={cx("flex items-center gap-3 rounded-2xl px-4 py-3",th==="dark"?"bg-white/[0.04]":"bg-white")}> 
                <Avatar name={dn(member)} icon={member.icon} iconImage={member.iconImage} th={th}/>
                <div className="min-w-0">
                  <p className="font-semibold truncate">{dn(member)}</p>
                  <p className={cx("text-sm truncate",th==="dark"?"text-slate-400":"text-slate-500")}>@{member.accountName}{member.id===trip.ownerId?` · ${t("owner")}`:""}</p>
                </div>
              </div>)}
            </div>
          </div>
        </div>
      </Card>

      {isMobileScreen&&<Card th={th} className="p-4 space-y-3">
        <Select th={th} label={t("overviewDetails")} value={mobileSection} onChange={e=>setMobileSection(e.target.value as "flight"|"hotel"|"notes"|"weather")}>
          <option value="flight">{t("flightLegs")}</option>
          <option value="hotel">{t("hotelStays")}</option>
          <option value="notes">{t("travelNotes")}</option>
          <option value="weather">{t("weather")}</option>
        </Select>
      </Card>}

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {showFlightSection&&<Card th={th} className="p-5 sm:p-8 space-y-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-3xl font-bold">{t("flightLegs")}</h3>
              <p className={cx("mt-1 text-sm",th==="dark"?"text-slate-400":"text-slate-500")}>{flightLegs.length===0?t("noFlightDetails"):tripFlightSummary(trip).join(" · ")}</p>
            </div>
            <Badge label={`${flightLegs.length}`} th={th} color="blue"/>
          </div>
          {flightLegs.length===0?<p className={cx("text-sm",th==="dark"?"text-slate-400":"text-slate-500")}>{t("noFlightDetails")}</p>
          :<div className="space-y-5">{flightLegs.map((leg,index)=><div key={leg.id} className={cx("rounded-[1.9rem] border p-5 sm:p-7 min-h-0",th==="dark"?"border-white/8 bg-white/[0.03]":"border-slate-200 bg-slate-50")}>
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
        </Card>}

        {showHotelSection&&<Card th={th} className="p-5 sm:p-8 space-y-5 min-w-0 overflow-hidden">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-3xl font-bold">{t("hotelStays")}</h3>
              <p className={cx("mt-1 text-sm",th==="dark"?"text-slate-400":"text-slate-500")}>{hotels.length===0?t("noHotelDetails"):tripHotelSummary(trip).join(" · ")}</p>
            </div>
            <Badge label={`${hotels.length}`} th={th} color="green"/>
          </div>
          {hotels.length===0?<p className={cx("text-sm",th==="dark"?"text-slate-400":"text-slate-500")}>{t("noHotelDetails")}</p>
          :<div className="space-y-5">{hotels.map((hotel,index)=><div key={hotel.id} className={cx("rounded-[1.9rem] border p-5 sm:p-7 min-h-0 min-w-0 overflow-hidden",th==="dark"?"border-white/8 bg-white/[0.03]":"border-slate-200 bg-slate-50")}>
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
        </Card>}
      </div>

      {showNotesSection&&<Card th={th} className="p-5 sm:p-7 space-y-5 min-w-0 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-2xl font-bold">{t("travelNotes")}</h3>
          <Btn th={th} sz="sm" onClick={addNote} disabled={!canEdit}>+ {t("addNote")}</Btn>
        </div>
        <Textarea th={th} value={noteText} onChange={e=>setNoteText(e.target.value)} placeholder={t("noteText")} className="min-h-32" disabled={!canEdit}/>
        <div className="flex flex-wrap gap-3 items-center">
          <label className={cx("file-label",th==="dark"?"bg-white/5 text-slate-300 hover:bg-white/10":"bg-slate-100 text-slate-700 hover:bg-slate-200")}>
            📎 {t("uploadFile")}<input type="file" multiple onChange={handleFileUpload} disabled={!canEdit}/>
          </label>
          <div className="flex flex-1 min-w-0 gap-2">
            <Input th={th} value={urlInput} onChange={e=>setUrlInput(e.target.value)} placeholder={t("fileUrl")} className="flex-1" disabled={!canEdit}/>
            <Btn th={th} v="sec" sz="sm" onClick={addUrl} disabled={!canEdit}>{t("add")}</Btn>
          </div>
          <Btn th={th} sz="sm" onClick={addNote} disabled={!canEdit||(!noteText.trim()&&noteFiles.length===0)}>💾 {t("saveDocuments")}</Btn>
        </div>
        {noteFiles.length>0&&<p className={cx("text-xs",th==="dark"?"text-amber-300":"text-amber-700")}>{t("unsavedAttachments")}</p>}
        {noteFiles.length>0&&<div className="space-y-2">{noteFiles.map((file,index)=><div key={`${file.name}-${index}`} className={cx("flex items-center justify-between gap-3 rounded-2xl px-4 py-3",th==="dark"?"bg-white/6":"bg-slate-100")}>
          <span className="truncate font-medium">{file.name}</span>
          <button onClick={()=>setNoteFiles(files=>files.filter((_,fileIndex)=>fileIndex!==index))} className="text-rose-400" disabled={!canEdit}>✕</button>
        </div>)}</div>}
        {trip.travelNotes.length===0?<Empty icon="📝" title={t("noNotes")} desc={t("noNotesDesc")} th={th}/>
        :<div className="space-y-4">{trip.travelNotes.map(note=><div key={note.id} className={cx("rounded-3xl p-5 border min-w-0 overflow-hidden",th==="dark"?"border-white/8 bg-white/[0.03]":"border-slate-200 bg-slate-50")}>
          <div className="mb-3 flex items-start justify-between gap-4">
            <div>
              <p className="font-semibold">{note.authorName}</p>
              <p className={cx("text-xs",th==="dark"?"text-slate-500":"text-slate-400")}>{new Date(note.createdAt).toLocaleString()}</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={()=>startEditNote(note)} className="opacity-70 hover:opacity-100" disabled={!canEdit}>✏️</button>
              <button onClick={()=>removeNote(note.id)} className="text-rose-400 opacity-70 hover:opacity-100" disabled={!canEdit}>✕</button>
            </div>
          </div>
          {editingNoteId===note.id
            ? <div className="mb-4 space-y-2">
                <Textarea th={th} value={editingNoteText} onChange={e=>setEditingNoteText(e.target.value)} className="min-h-24" disabled={!canEdit}/>
                <div className="flex gap-2">
                  <Btn th={th} sz="sm" onClick={saveEditedNote} disabled={!canEdit}>{t("save")}</Btn>
                  <Btn th={th} v="sec" sz="sm" onClick={()=>{setEditingNoteId(null);setEditingNoteText("");}} disabled={!canEdit}>{t("cancel")}</Btn>
                </div>
              </div>
            : (note.text&&<p className="mb-4 whitespace-pre-wrap break-words">{note.text}</p>)}
          {note.attachments.length>0&&<div className="grid sm:grid-cols-2 gap-3">{note.attachments.map((att,index)=><a key={`${att.url}-${index}`} href={att.url} target="_blank" rel="noreferrer" download={att.name} className={cx("flex items-center justify-between gap-3 rounded-2xl px-4 py-3 border transition",th==="dark"?"border-white/8 bg-white/[0.03] hover:bg-white/[0.06] text-cyan-300":"border-slate-200 bg-white hover:bg-slate-50 text-blue-700")}>
            <span className="truncate min-w-0 font-medium">{att.name}</span>
            <span className="text-xs uppercase tracking-[0.18em]">{t("downloadAttachment")}</span>
          </a>)}</div>}
        </div>)}</div>}
      </Card>}
    </div>

    {showWeatherSection&&<Card th={th} className="sticky top-6 h-fit space-y-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className={cx("text-sm uppercase tracking-[0.2em]",th==="dark"?"text-slate-400":"text-slate-500")}>{t("weather")}</p>
          <h3 className="mt-1 text-xl font-bold leading-snug">{activeWeatherPlan?.label || trip.customLocation?.name||trip.location}</h3>
        </div>
        <Btn th={th} v="sec" sz="sm" onClick={()=>void loadWeather()} disabled={loading}>{loading?t("loading"):t("refreshWeather")}</Btn>
      </div>
      {trip.weatherLocations?.length ? <div className="space-y-2">
        <Select th={th} label="Weather by Trip Days" value={selectedWeatherLocationId} onChange={e=>setSelectedWeatherLocationId(e.target.value)}>
          {trip.weatherLocations.map(item=><option key={item.id} value={item.id}>{item.label} · Day {item.startDay}-{item.endDay}</option>)}
        </Select>
        {activeWeatherPlan&&<div className="flex items-center justify-between gap-2">
          <p className={cx("text-sm",th==="dark"?"text-cyan-300":"text-blue-700")}>Day {activeWeatherPlan.startDay}-{activeWeatherPlan.endDay} · {activeWeatherPlan.location.name}</p>
          <Btn th={th} v="danger" sz="sm" onClick={()=>removeWeatherPlan(activeWeatherPlan.id)} disabled={!canEdit}>{t("remove")}</Btn>
        </div>}
      </div> : null}
      {trip.customLocation&&<p className={cx("text-sm",th==="dark"?"text-cyan-300":"text-blue-700")}>{t("savedLocation")}: {trip.customLocation.name}</p>}
      <Btn th={th} v="ghost" sz="sm" onClick={()=>setShowCustomLoc(true)} disabled={!canEdit}>{t("customLocation")}</Btn>
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
    </Card>}

    <Modal open={showPdfModal} onClose={()=>setShowPdfModal(false)} th={th} title={t("exportPdf")}>
      <div className="space-y-4">
        <p className={cx("text-sm",th==="dark"?"text-slate-300":"text-slate-600")}>Choose which sections to include in the PDF.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {PDF_SECTION_ORDER.map(section=><label key={section.id} className={cx("flex items-center gap-2 rounded-xl border px-3 py-2 text-sm",
            th==="dark"?"border-white/10 bg-white/[0.03]":"border-slate-200 bg-slate-50")}>
            <input type="checkbox" checked={pdfSections.includes(section.id)} onChange={()=>togglePdfSection(section.id)} />
            <span>{section.label}</span>
          </label>)}
        </div>
        <div className="flex items-center justify-between">
          <Btn th={th} v="ghost" sz="sm" onClick={()=>setPdfSections(PDF_SECTION_ORDER.map(section=>section.id))}>Select all</Btn>
          <Btn th={th} v="ghost" sz="sm" onClick={()=>setPdfSections([])}>Clear</Btn>
        </div>
        <div className="flex justify-end gap-2">
          <Btn th={th} v="sec" onClick={()=>setShowPdfModal(false)}>{t("cancel")}</Btn>
          <Btn th={th} onClick={runPdfExport}>🧾 {t("exportPdf")}</Btn>
        </div>
      </div>
    </Modal>

    <Modal open={showCustomLoc} onClose={()=>setShowCustomLoc(false)} th={th} title={t("customLocation")}>
      <div className="space-y-4">
        <div className="flex gap-2">
          <Input th={th} label={t("locationName")} value={customForm.query} onChange={e=>setCustomForm(f=>({...f,query:e.target.value}))} placeholder="City, country" className="flex-1"/>
          <Btn th={th} v="sec" onClick={()=>void runLocationSearch()} disabled={searchingLocation}>{searchingLocation?t("loading"):t("searchLocation")}</Btn>
        </div>
        {searchResults.length>0&&<Select th={th} label={t("matchingLocations")} value={customForm.selected ? `${customForm.selected.name}-${customForm.selected.lat}-${customForm.selected.lon}` : ""} onChange={e=>{
          const selected = searchResults.find(item=>`${item.name}-${item.lat}-${item.lon}`===e.target.value) ?? null;
          setCustomForm(f=>({...f,selected}));
        }}>
          <option value="">Select a location</option>
          {searchResults.map(item=><option key={`${item.name}-${item.lat}-${item.lon}`} value={`${item.name}-${item.lat}-${item.lon}`}>{item.name}{item.subtitle ? ` — ${item.subtitle}` : ""}</option>)}
        </Select>}
        <div className="grid grid-cols-2 gap-3">
          <Input th={th} label={t("startDay")} type="number" min={1} max={trip.duration} value={customForm.startDay} onChange={e=>setCustomForm(f=>({...f,startDay:+e.target.value}))}/>
          <Input th={th} label={t("endDay")} type="number" min={1} max={trip.duration} value={customForm.endDay} onChange={e=>setCustomForm(f=>({...f,endDay:+e.target.value}))}/>
        </div>
        {customForm.selected&&<p className={cx("text-sm",th==="dark"?"text-cyan-300":"text-blue-700")}>Selected: {customForm.selected.name} ({customForm.selected.lat.toFixed(3)}, {customForm.selected.lon.toFixed(3)}) {customForm.selected.subtitle ? `· ${customForm.selected.subtitle}` : ""}</p>}
        <div className="flex justify-end gap-2">
          <Btn th={th} v="sec" onClick={()=>setShowCustomLoc(false)}>{t("cancel")}</Btn>
          <Btn th={th} onClick={setCustomLocation} disabled={!canEdit||!customForm.selected}>{t("setCustom")}</Btn>
        </div>
      </div>
    </Modal>
  </div>;
}

function TripTravelers({trip,user,profiles,th,t,onUpdateTrip}:{trip:Trip;user:Profile;profiles:Profile[];th:ThemeMode;t:(k:TKey)=>string;onUpdateTrip:(id:string,d:Partial<Trip>)=>void}){
  const members=trip.members.map(id=>profiles.find(profile=>profile.id===id)).filter(Boolean) as Profile[];
  const isOwner=trip.ownerId===user.id;
  const canManageReminder = canEditSettings(getTripRole(trip,user.id));
  const isMobileScreen=useMobileScreen();
  const [selectedMemberId,setSelectedMemberId]=useState(members[0]?.id ?? "");
  const [reminderOpen,setReminderOpen]=useState(false);
  const [sendingReminder,setSendingReminder]=useState(false);
  const reminderTemplate = normalizeReminderTemplate(trip.reminderTemplate);
  const setRole=(memberId:string,role:TripRole)=>{
    if(!isOwner || memberId===trip.ownerId) return;
    onUpdateTrip(trip.id,{memberRoles:{...(trip.memberRoles ?? {}),[memberId]:role}});
  };
  const updateReminderTemplate=(patch:Partial<ReminderTemplate>)=>{
    if(!canManageReminder) return;
    onUpdateTrip(trip.id,{reminderTemplate:{...normalizeReminderTemplate(trip.reminderTemplate),...patch}});
  };

  const memberStats=members.map(member=>{
    const paid=trip.expenses.filter(exp=>exp.paidBy===member.id).reduce((sum,exp)=>sum+exp.amount,0);
    const expenseTouches=trip.expenses.filter(exp=>(exp.participants ?? []).includes(member.id) || exp.paidBy===member.id).length;
    const role=getTripRole(trip,member.id);
    return {member,paid,expenseTouches,role};
  });
  const myBalance=settlements(trip,profiles).bal.find(item=>item.id===user.id)?.net ?? 0;
  useEffect(()=>{
    if(!memberStats.find(item=>item.member.id===selectedMemberId)){
      setSelectedMemberId(memberStats[0]?.member.id ?? "");
    }
  },[memberStats,selectedMemberId]);
  const buildReminderBody=()=>{
    const lines:string[]=[reminderTemplate.body.trim()];
    if(reminderTemplate.includeTripTitle) lines.push(`${t("reminderTripTitle")}: ${trip.title}`);
    if(reminderTemplate.includeDates) lines.push(`${t("reminderTripDates")}: ${fmtDate(trip.startDate)} - ${fmtDate(trip.endDate)}`);
    if(reminderTemplate.includeLocation) lines.push(`${t("reminderLocation")}: ${trip.location || "—"}`);
    if(reminderTemplate.includeTripId) lines.push(`${t("reminderTripId")}: ${trip.id}`);
    if(reminderTemplate.includeFlightSummary){
      lines.push(`${t("reminderFlightSummary")}: ${tripFlightSummary(trip).join(" · ") || t("none")}`);
    }
    if(reminderTemplate.includeHotelSummary){
      lines.push(`${t("reminderHotelSummary")}: ${tripHotelSummary(trip).join(" · ") || t("none")}`);
    }
    if(reminderTemplate.includeNotesSummary){
      const { noteTexts, attachmentLinks } = buildReminderNotesSummary(trip.travelNotes, t);
      if(noteTexts.length) lines.push(`${t("travelNotes")}: ${noteTexts.join(" | ")}`);
      if(attachmentLinks.length) lines.push(`${t("attachments")}: ${attachmentLinks.join(" | ")}`);
    }
    return lines.filter(Boolean).join("\n\n");
  };

  const sendReminderEmail=()=>{
    const body = buildReminderBody();
    const opened = openReminderDraftInGmail({
      memberIds: trip.members,
      profiles,
      subjectTemplate: reminderTemplate.subject,
      tripTitle: trip.title,
      body,
    });
    if(!opened) return;
    setSendingReminder(true);
    setTimeout(()=>setSendingReminder(false),500);
  };
  const visibleMemberStats=isMobileScreen
    ? memberStats.filter(item=>item.member.id===selectedMemberId)
    : memberStats;

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
        <div className={cx("rounded-2xl p-4",th==="dark"?"bg-white/[0.04]":"bg-slate-100")}>
          <p className={cx("text-xs uppercase tracking-[0.16em]",th==="dark"?"text-slate-400":"text-slate-500")}>Net ({t("iOwe")})</p>
          <p className="mt-2 text-2xl font-bold">{myBalance<0?fmtCur(Math.abs(myBalance)):fmtCur(0)}</p>
        </div>
      </div>
      {isMobileScreen&&memberStats.length>0&&<div className="mt-4">
        <Select th={th} label={t("travelers")} value={selectedMemberId} onChange={e=>setSelectedMemberId(e.target.value)}>
          {memberStats.map(item=><option key={item.member.id} value={item.member.id}>{dn(item.member)}</option>)}
        </Select>
      </div>}
    </Card>

    <div className="grid xl:grid-cols-2 gap-5">
      {visibleMemberStats.map(({member,paid,expenseTouches,role})=><Card key={member.id} th={th} className="p-7 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-4">
            <Avatar name={dn(member)} icon={member.icon} iconImage={member.iconImage} th={th}/>
            <div>
              <p className="text-xl font-semibold">{dn(member)}</p>
              <p className={cx("text-sm",th==="dark"?"text-slate-400":"text-slate-500")}>@{member.accountName}</p>
            </div>
          </div>
          <Badge label={tripRoleLabel(role,t)} th={th} color={role==="owner"?"amber":role==="editor"?"green":"blue"}/>
        </div>

        {isOwner&&member.id!==trip.ownerId&&<div>
          <p className={cx("text-xs mb-2",th==="dark"?"text-slate-400":"text-slate-500")}>Role</p>
          <div className="flex gap-2 flex-wrap">
            {(["editor","viewer"] as TripRole[]).map(roleOption=><button key={tripRoleLabel(roleOption,t)} type="button" onClick={()=>setRole(member.id,roleOption)}
              className={cx("px-3 py-1.5 rounded-full text-sm font-medium transition",
                role===roleOption
                  ?(th==="dark"?"bg-cyan-400 text-slate-950":"bg-slate-800 text-white")
                  :(th==="dark"?"bg-white/5 text-slate-400":"bg-slate-100 text-slate-500"))}>
              {tripRoleLabel(roleOption,t)}
            </button>)}
          </div>
        </div>}

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
          <InfoRow label={t("status")} value={tripRoleLabel(role,t)} th={th}/>
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

    <Card th={th} className="p-5 sm:p-6">
      <button type="button" onClick={()=>setReminderOpen(v=>!v)} className={cx("w-full flex items-center justify-between rounded-2xl px-4 py-3 text-left font-semibold",th==="dark"?"bg-white/[0.04]":"bg-slate-100")}>
        <span>📧 {t("reminderEmailCard")}</span>
        <span>{reminderOpen ? "−" : "+"}</span>
      </button>
      {reminderOpen&&<div className="mt-4 space-y-4">
        <p className={cx("text-sm",th==="dark"?"text-slate-400":"text-slate-500")}>
          {t("reminderEmailHint")}
        </p>
        <Input th={th} label={t("subjectTemplate")} value={reminderTemplate.subject} onChange={e=>updateReminderTemplate({subject:e.target.value})} disabled={!canManageReminder}/>
        <Textarea th={th} label={t("emailBodyTemplate")} value={reminderTemplate.body} onChange={e=>updateReminderTemplate({body:e.target.value})} className="min-h-28" disabled={!canManageReminder}/>
        <div className="grid sm:grid-cols-2 gap-2 text-sm">
          {[
            [t("reminderTripTitle"),"includeTripTitle"],
            [t("reminderTripDates"),"includeDates"],
            [t("reminderLocation"),"includeLocation"],
            [t("reminderTripId"),"includeTripId"],
            [t("reminderFlightSummary"),"includeFlightSummary"],
            [t("reminderHotelSummary"),"includeHotelSummary"],
            [t("reminderNotesLinks"),"includeNotesSummary"],
          ].map(([label,key])=><label key={key} className={cx("rounded-xl border px-3 py-2 flex items-center gap-2",th==="dark"?"border-white/10 bg-white/[0.03]":"border-slate-200 bg-slate-50")}>
            <input type="checkbox" checked={Boolean(reminderTemplate[key as keyof ReminderTemplate])} disabled={!canManageReminder} onChange={e=>updateReminderTemplate({[key]:e.target.checked} as Partial<ReminderTemplate>)}/>
            {label}
          </label>)}
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <Btn th={th} sz="sm" onClick={()=>sendReminderEmail()} disabled={!canManageReminder||sendingReminder}>
            {sendingReminder ? t("preparing") : t("sendReminderDraft")}
          </Btn>
          <p className={cx("text-xs",th==="dark"?"text-slate-400":"text-slate-500")}>
            {t("reminderEmailSupportText")}
          </p>
        </div>
      </div>}
    </Card>
  </div>;
}

function TripItinerary({trip,user,profiles,canEdit,canEditFreeTime,th,t,onUpdate,onTripUpdate}:{trip:Trip;user:Profile;profiles:Profile[];canEdit:boolean;canEditFreeTime:boolean;th:ThemeMode;t:(k:TKey)=>string;onUpdate:(tid:string,items:ItineraryItem[])=>void;onTripUpdate:(id:string,d:Partial<Trip>)=>void}){
  const TRANSPORT_OPTIONS = ["Flight","Train","Bus","Taxi","Rental Car","Walk","Ferry","Metro","Other"] as const;
  const emptyForm={startTime:"09:00",endTime:"10:00",endDayOffset:0,title:"",stopLocation:"",transport:"Activity",transportType:"Flight",customTransport:"",details:"",photo:"",mapUrl:"",activityType:"regular" as "regular"|"free-time"|"transport",timeMode:"timed" as "timed"|"whole-day",dayCount:1,mediaSize:"small" as "small"|"medium"|"large",freeTimeParticipantIds:[] as string[],needsFollowUp:false,followUpNote:""};
  const ACTIVITY_TYPE_OPTIONS = [
    { value:"regular", label:t("activity") },
    { value:"transport", label:t("transport") },
    { value:"free-time", label:t("freeTime") },
  ] as const;
  const emptyOptionalForm={day:1,type:"site" as OptionalStop["type"],title:"",location:"",url:"",mapUrl:"",notes:""};
  const [activePane,setActivePane]=useState<"schedule"|"saved">("schedule");
  const [day,setDay]=useState(1);
  const [form,setForm]=useState(emptyForm);
  const [editId,setEditId]=useState<string|null>(null);
  const [optionalForm,setOptionalForm]=useState(emptyOptionalForm);
  const [optionalEditId,setOptionalEditId]=useState<string|null>(null);
  const [travelerView,setTravelerView]=useState(user.id);
  const [swapTargetDay,setSwapTargetDay]=useState(trip.duration>=2 ? 2 : 1);
  const canManageItem = (item?:ItineraryItem)=> item?.activityType==="free-time"
    ? (canEdit || item.freeTimeOwnerId===user.id)
    : canEdit;

  const dayItems=trip.itinerary.filter(it=>it.day===day).sort((a,b)=>a.order-b.order);
  const optionalDayItems=trip.optionalStops.filter(stop=>stop.day===day);
  const totalItems=trip.itinerary.length;
  const photoCount=trip.itinerary.filter(it=>Boolean(it.photo)).length;
  const mediaClassBySize: Record<"small"|"medium"|"large", string> = {
    small: "h-28 sm:h-32",
    medium: "h-40 sm:h-48",
    large: "h-52 sm:h-64",
  };
  const mediaRowClassBySize: Record<"small"|"medium"|"large", string> = {
    small: "max-w-xs",
    medium: "max-w-md",
    large: "max-w-full",
  };
  const persistItems=(nextItems:ItineraryItem[])=>onUpdate(trip.id,nextItems);

  const saveActivity=async(e:React.FormEvent)=>{
    e.preventDefault();
    if(!(canEdit || (form.activityType==="free-time" && canEditFreeTime))) return;
    if(!form.title.trim())return;
    const transportLabel = form.activityType==="transport"
      ? (form.transportType==="Other" ? (form.customTransport.trim() || "Other") : form.transportType)
      : form.activityType==="free-time" ? "Free Time" : "Activity";
    const payload={
      startTime:form.startTime,
      endTime:form.endTime,
      endDayOffset:form.endDayOffset,
      title:form.title,
      stopLocation:form.stopLocation,
      transport:transportLabel,
      details:form.details,
      photo:form.photo,
      mediaSize: form.mediaSize,
      mapUrl:form.mapUrl||googleMapEmbedUrl(form.stopLocation),
      activityType:form.activityType,
      needsFollowUp: form.needsFollowUp,
      followUpNote: form.followUpNote.trim(),
      freeTimeOwnerId: form.activityType==="free-time" ? (editId ? trip.itinerary.find(it=>it.id===editId)?.freeTimeOwnerId || user.id : user.id) : "",
      freeTimeParticipantIds: form.activityType==="free-time" ? form.freeTimeParticipantIds : [],
    };
    const next=editId
      ? trip.itinerary.map(it=>it.id===editId?{...it,...payload,day}:it)
      : [...trip.itinerary,{id:uid("it"),day,order:0,...payload,transitToNext:{duration:"",details:""}}];
    const candidate = { startTime: payload.startTime, endTime: payload.endTime, endDayOffset: payload.endDayOffset };
    const overlap = trip.itinerary.some(it=>it.day===day && it.id!==editId && hasTimeOverlap(candidate,it));
    if(overlap){
      const shouldContinue = window.confirm("This activity overlaps another itinerary item. Continue anyway?");
      if(!shouldContinue) return;
    }
    persistItems(sortItineraryByDayAndTime(next));
    setEditId(null);
    setForm(emptyForm);
  };

  const move=async(idx:number,dir:1|-1)=>{
    if(!canEdit) return;
    const swapWith=idx+dir;
    if(swapWith<0||swapWith>=dayItems.length)return;
    const reordered=[...dayItems];
    [reordered[idx],reordered[swapWith]]=[reordered[swapWith],reordered[idx]];
    const orderMap=new Map(reordered.map((item,index)=>[item.id,index+1]));
    const next=trip.itinerary.map(it=>it.day===day?{...it,order:orderMap.get(it.id)??it.order}:it);
    persistItems(sortItineraryByDayAndTime(next));
  };

  const swapDaySchedule=(targetDay:number)=>{
    if(!canEdit || trip.duration < 2) return;
    if(!Number.isInteger(targetDay) || targetDay < 1 || targetDay > trip.duration || targetDay===day){
      window.alert(`Please enter a valid day number between 1 and ${trip.duration}, excluding Day ${day}.`);
      return;
    }
    const next = trip.itinerary.map(item=>{
      if(item.day===day) return {...item,day:targetDay};
      if(item.day===targetDay) return {...item,day};
      return item;
    });
    const swappedOptionalStops = trip.optionalStops.map(stop=>{
      if(stop.day===day) return {...stop,day:targetDay};
      if(stop.day===targetDay) return {...stop,day};
      return stop;
    });
    onTripUpdate(trip.id,{optionalStops:swappedOptionalStops});
    persistItems(sortItineraryByDayAndTime(next));
  };

  const remove=async(id:string)=>{
    const target = trip.itinerary.find(it=>it.id===id);
    if(!canManageItem(target)) return;
    const remaining=trip.itinerary.filter(it=>it.id!==id);
    const remainingDay=remaining.filter(it=>it.day===day).sort((a,b)=>a.order-b.order);
    const orderMap=new Map(remainingDay.map((item,index)=>[item.id,index+1]));
    const next=remaining.map(it=>it.day===day?{...it,order:orderMap.get(it.id)??it.order}:it);
    persistItems(next);
  };

  const edit=(it:ItineraryItem)=>{
    const mode=((it.startTime==="00:00"||it.startTime==="00:00:00")&&(it.endTime==="23:59"||it.endTime==="23:59:00"))?"whole-day":"timed";
    if(!canManageItem(it)) return;
    const inferredType: "regular"|"free-time"|"transport" = it.activityType
      ?? (it.transport==="Free Time"
        ? "free-time"
        : (it.transport && it.transport!=="Activity" ? "transport" : "regular"));
    const matchedTransport = TRANSPORT_OPTIONS.find(option=>option.toLowerCase()===(it.transport || "").toLowerCase());
    setForm({ startTime:it.startTime,endTime:it.endTime,endDayOffset:it.endDayOffset??0,title:it.title,stopLocation:it.stopLocation ?? "",transport:it.transport,transportType:matchedTransport ?? "Other",customTransport:matchedTransport ? "" : (inferredType==="transport" ? (it.transport||"") : ""),details:it.details,photo:it.photo??"",mapUrl:it.mapUrl??"",activityType:inferredType,timeMode:mode,dayCount:(it.endDayOffset??0)+1,mediaSize:it.mediaSize??"small",freeTimeParticipantIds:[...(it.freeTimeParticipantIds ?? [])],needsFollowUp:Boolean(it.needsFollowUp),followUpNote:it.followUpNote??"" });
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

  const saveOptionalStop=(e:React.FormEvent)=>{
    e.preventDefault();
    if(!canEdit) return;
    if(!optionalForm.title.trim()) return;
    const normalized={
      ...optionalForm,
      day:Math.min(Math.max(optionalForm.day,1),trip.duration),
      mapUrl: optionalForm.mapUrl || googleMapEmbedUrl(optionalForm.location),
    };
    const next = optionalEditId
      ? trip.optionalStops.map(stop=>stop.id===optionalEditId?{...stop,...normalized}:stop)
      : [{id:uid("opt"),...normalized}, ...trip.optionalStops];
    onTripUpdate(trip.id,{optionalStops:next});
    setOptionalEditId(null);
    setOptionalForm({...emptyOptionalForm,day});
  };

  const editOptionalStop=(stop:OptionalStop)=>{
    setOptionalEditId(stop.id);
    setOptionalForm({day:stop.day,type:stop.type,title:stop.title,location:stop.location,url:stop.url,mapUrl:stop.mapUrl ?? "",notes:stop.notes});
    setDay(stop.day);
    setActivePane("saved");
  };

  const removeOptionalStop=(id:string)=>onTripUpdate(trip.id,{optionalStops:trip.optionalStops.filter(stop=>stop.id!==id)});
  const profileMap = new Map(profiles.map(profile=>[profile.id,profile]));
  const splitTimeline = dayItems
    .filter(item=>item.activityType!=="free-time"
      || item.freeTimeOwnerId===travelerView
      || (item.freeTimeParticipantIds ?? []).includes(travelerView))
    .map(item=>({ sortTime:item.startTime || "23:59", item }))
    .sort((a,b)=>a.sortTime.localeCompare(b.sortTime));

  useEffect(()=>{
    setOptionalForm(current=>current.day===day?current:{...current,day});
  },[day]);
  useEffect(()=>{
    if(trip.duration < 2){
      setSwapTargetDay(1);
      return;
    }
    if(swapTargetDay===day || swapTargetDay>trip.duration){
      setSwapTargetDay(day===1 ? 2 : 1);
    }
  },[day,swapTargetDay,trip.duration]);

  return <div className="grid min-w-0 gap-6 lg:grid-cols-[1.45fr_.95fr]">
    <div className="space-y-5">
      <Card th={th} className="p-5 space-y-4">
        <div className="grid sm:grid-cols-4 gap-3">
          <div className={cx("rounded-2xl p-4",th==="dark"?"bg-white/[0.04]":"bg-slate-100")}><p className={cx("text-xs",th==="dark"?"text-slate-400":"text-slate-500")}>{t("itinerary")}</p><p className="mt-1 text-2xl font-bold">{totalItems}</p></div>
          <div className={cx("rounded-2xl p-4",th==="dark"?"bg-white/[0.04]":"bg-slate-100")}><p className={cx("text-xs",th==="dark"?"text-slate-400":"text-slate-500")}>{t("day")}</p><p className="mt-1 text-2xl font-bold">{day}/{trip.duration}</p></div>
          <div className={cx("rounded-2xl p-4",th==="dark"?"bg-white/[0.04]":"bg-slate-100")}><p className={cx("text-xs",th==="dark"?"text-slate-400":"text-slate-500")}>{t("itineraryPhoto")}</p><p className="mt-1 text-2xl font-bold">{photoCount}</p></div>
          <div className={cx("rounded-2xl p-4",th==="dark"?"bg-white/[0.04]":"bg-slate-100")}><p className={cx("text-xs",th==="dark"?"text-slate-400":"text-slate-500")}>{t("optionalPlaces")}</p><p className="mt-1 text-2xl font-bold">{trip.optionalStops.length}</p></div>
        </div>
      </Card>

      <Card th={th} className="p-5 sm:p-8 min-w-0 overflow-hidden">
        <div className="mb-4 flex items-center gap-2 overflow-x-auto pb-2">
          {Array.from({length:trip.duration},(_,i)=>i+1).map(d=><button key={d} onClick={()=>setDay(d)} className={cx("rounded-2xl px-4 py-2.5 font-medium whitespace-nowrap transition border",d===day?(th==="dark"?"bg-cyan-400 text-slate-950 border-cyan-300":"bg-slate-800 text-white border-slate-700"):(th==="dark"?"bg-white/5 text-slate-400 hover:bg-white/10 border-white/10":"bg-slate-100 text-slate-600 hover:bg-slate-200 border-slate-200"))}>{t("day")} {d}</button>)}
        </div>
        <div className={cx("mb-6 rounded-2xl p-4",th==="dark"?"bg-white/[0.03]":"bg-slate-100")}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="font-semibold">{t("splitTimelineByTraveler")}</p>
            <Select th={th} value={travelerView} onChange={e=>setTravelerView(e.target.value)} className="w-full sm:w-auto sm:max-w-[220px] !rounded-xl !px-3 !py-2 text-sm">
              {trip.members.map(memberId=>{
                const traveler=profileMap.get(memberId);
                return <option key={memberId} value={memberId}>{traveler?dn(traveler):memberId}</option>;
              })}
            </Select>
          </div>
          <div className="space-y-2 text-sm">
            {splitTimeline.length===0?<p className={cx(th==="dark"?"text-slate-400":"text-slate-500")}>{t("noTravelerActivities").replace("{day}",String(day))}</p>
              :splitTimeline.map(entry=><p key={`it-${entry.item.id}`} className="break-words">🗓️ {entry.item.startTime} {entry.item.title}</p>)}
          </div>
        </div>

        <Tabs tabs={[{id:"schedule",label:t("itinerarySchedule"),icon:"🗓️"},{id:"saved",label:t("optionalPlaces"),icon:"📌"}]} active={activePane} onChange={setActivePane} th={th}/>

        {activePane==="schedule" ? (<>{dayItems.length===0?<div className="mt-6"><Empty icon="🗓️" title={t("noItinerary")} desc={t("noItineraryDesc")} th={th}/></div>:<div className="mt-6 space-y-5 max-w-full">{dayItems.map((it,idx)=><div key={it.id} className="space-y-3 relative min-w-0 max-w-full">
          {idx<dayItems.length-1&&<span className={cx("absolute left-[18px] top-14 h-[calc(100%-1.2rem)] w-px",th==="dark"?"bg-white/10":"bg-slate-200")}/>}<Card th={th} className={cx("p-4 sm:p-5 rounded-3xl min-w-0 overflow-hidden",it.transport==="Flight"?(th==="dark"?"bg-indigo-500/10 border-indigo-400/40":"bg-indigo-50 border-indigo-200"):"",it.needsFollowUp&&(th==="dark"?"bg-amber-400/10 border-amber-300/40":"bg-amber-50 border-amber-300"))}>
            <div className="flex flex-col sm:flex-row items-start gap-3 sm:gap-4">
              <div className="flex flex-col gap-1"><button onClick={()=>move(idx,-1)} disabled={!canEdit||idx===0} className="text-lg opacity-60 hover:opacity-100 disabled:opacity-20">▲</button><button onClick={()=>move(idx,1)} disabled={!canEdit||idx===dayItems.length-1} className="text-lg opacity-60 hover:opacity-100 disabled:opacity-20">▼</button></div>
              <div className="flex-1 min-w-0">
                <div className="mb-2 flex items-start justify-between gap-3"><div className="min-w-0"><p className={cx("text-sm font-mono",th==="dark"?"text-cyan-400":"text-blue-600")}>{it.startTime} - {it.endTime}{(it.endDayOffset??0)>0?` (+${it.endDayOffset}d)`:""}</p><p className="text-lg font-bold break-words">{it.needsFollowUp?`“${it.title}”`:it.title}</p></div><Badge label={it.activityType==="free-time"?t("freeTime"):it.activityType==="transport"?t("transport"):t("activity")} th={th} color={it.activityType==="free-time"?"amber":it.activityType==="transport"?"green":undefined}/></div>
                {it.needsFollowUp&&<p className={cx("mb-2 rounded-xl border px-3 py-2 text-sm font-semibold",th==="dark"?"border-amber-200/40 bg-amber-300/10 text-amber-200":"border-amber-300 bg-amber-100 text-amber-800")}>⚠️ {t("followUpBadge")} {it.followUpNote ? `— “${it.followUpNote}”` : ""}</p>}
                {it.stopLocation&&<p className={cx("mb-2 text-sm",th==="dark"?"text-cyan-300":"text-blue-700")}>📍 {it.stopLocation}</p>}
                {it.details&&<p className={cx("text-sm leading-6 break-words whitespace-pre-wrap",th==="dark"?"text-slate-400":"text-slate-500")}>{it.details}</p>}

                {(it.mapUrl || it.photo)&&<div className={cx("mt-4 grid w-full max-w-full gap-3",it.mapUrl&&it.photo?"grid-cols-1 sm:grid-cols-2":"grid-cols-1",mediaRowClassBySize[it.mediaSize ?? "small"])}>
                  {it.mapUrl&&<div className={cx("overflow-hidden rounded-2xl border border-white/10",it.photo ? "aspect-square" : "aspect-[16/9] max-h-44")}>
                    <iframe src={it.mapUrl} title={`${it.title}-map`} loading="lazy" className="h-full w-full"/>
                  </div>}
                  {it.photo&&<div className="aspect-square overflow-hidden rounded-2xl border border-white/10 bg-slate-100/30">
                    <img src={it.photo} alt={it.title} className="h-full w-full object-cover"/>
                  </div>}
                </div>}
              </div>
              <div className="flex w-full sm:w-auto gap-2 justify-end self-end sm:self-start"><button onClick={()=>edit(it)} disabled={!canManageItem(it)} className={cx("rounded-full px-2.5 py-1 text-sm",th==="dark"?"bg-white/10 hover:bg-white/20":"bg-slate-100 hover:bg-slate-200","disabled:opacity-40")}>✏️</button><button onClick={()=>remove(it.id)} disabled={!canManageItem(it)} className={cx("rounded-full px-2.5 py-1 text-sm text-rose-400",th==="dark"?"bg-rose-500/10 hover:bg-rose-500/20":"bg-rose-50 hover:bg-rose-100","disabled:opacity-40")}>✕</button></div>
            </div>
          </Card>
        </div>)}</div>}
        </>) : (<div className="mt-6 space-y-4">
          {optionalDayItems.length===0?<Empty icon="📌" title={t("noOptionalPlaces")} desc={t("noOptionalPlacesDesc")} th={th}/>:optionalDayItems.map(stop=><Card key={stop.id} th={th} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-lg font-bold break-words">{stop.title}</p>
                  <Badge label={t(stop.type === "site" ? "sight" : stop.type === "restaurant" ? "restaurant" : "other")} th={th} color={stop.type === "restaurant" ? "amber" : stop.type === "other" ? "slate" : "green"}/>
                </div>
                <p className={cx("mt-2 text-sm",th==="dark"?"text-cyan-300":"text-blue-700")}>{stop.location || "—"}</p>
                {stop.notes&&<p className={cx("mt-2 text-sm leading-6 break-words whitespace-pre-wrap",th==="dark"?"text-slate-300":"text-slate-600")}>{stop.notes}</p>}
                {stop.mapUrl&&<iframe src={stop.mapUrl} title={`${stop.title}-optional-map`} loading="lazy" className="mt-3 h-36 w-full max-w-md rounded-2xl border border-white/10"/>}
                {stop.url&&<a href={stop.url} target="_blank" rel="noreferrer" className={cx("mt-3 inline-flex text-sm font-semibold underline",th==="dark"?"text-cyan-300":"text-blue-700")}>{stop.url}</a>}
              </div>
              <div className="flex gap-2">
                <Btn th={th} v="sec" sz="sm" onClick={()=>editOptionalStop(stop)} disabled={!canEdit}>{t("edit")}</Btn>
                <Btn th={th} v="danger" sz="sm" onClick={()=>removeOptionalStop(stop.id)} disabled={!canEdit}>{t("remove")}</Btn>
              </div>
            </div>
          </Card>)}
        </div>)}
      </Card>
    </div>

    <Card th={th} className="p-6 h-fit lg:sticky lg:top-6">
      <div className={cx("mb-4 rounded-2xl border p-3 sm:p-4",th==="dark"?"border-white/10 bg-white/[0.02]":"border-slate-200 bg-slate-50")}>
        <p className="text-sm font-semibold">🔁 {t("swapThisDayItinerary")}</p>
        <p className={cx("mt-1 text-xs",th==="dark"?"text-slate-400":"text-slate-500")}>
          {t("swapItineraryHelp").replace("{day}",String(day))}
        </p>
        <div className="mt-3 flex flex-col gap-2">
          <Select th={th} label={t("swapWith")} value={String(swapTargetDay)} onChange={e=>setSwapTargetDay(Number(e.target.value))}>
            {Array.from({length:trip.duration},(_,i)=>i+1)
              .filter(d=>d!==day)
              .map(d=><option key={`swap-sidebar-${d}`} value={d}>{t("day")} {d}</option>)}
          </Select>
          <button
            onClick={()=>swapDaySchedule(swapTargetDay)}
            disabled={!canEdit || trip.duration < 2 || swapTargetDay===day}
            className={cx("rounded-xl px-3 py-2 text-sm font-medium border transition",th==="dark"?"border-white/15 bg-white/5 text-slate-200 hover:bg-white/10":"border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200","disabled:opacity-40 disabled:cursor-not-allowed")}
          >
            {t("swapDayButton").replace("{dayA}",String(day)).replace("{dayB}",String(swapTargetDay))}
          </button>
        </div>
      </div>
      {!canEdit&&<p className={cx("mb-3 text-sm",th==="dark"?"text-slate-400":"text-slate-500")}>Only owner/editor can edit shared itinerary details. You can still manage your own free-time plans.</p>}
      <div className="mb-4">
        <h3 className="text-xl font-bold">{activePane==="schedule" ? (editId?t("edit"):t("addActivity")) : (optionalEditId?t("editOptionalPlace"):t("addOptionalPlace"))}</h3>
        <p className={cx("mt-2 text-sm",th==="dark"?"text-slate-400":"text-slate-500")}>{activePane==="schedule" ? t("noItineraryDesc") : t("optionalPlacesDesc")}</p>
      </div>

      {activePane==="schedule" ? <form onSubmit={saveActivity} className="space-y-3">
        <Select
          th={th}
          label={t("activityType")}
          value={form.activityType}
          onChange={e=>{
            const mode=e.target.value;
            if(mode==="free-time"){
              setForm(f=>({...f,activityType:"free-time",title:f.title||t("freeTime"),stopLocation:"",mapUrl:"",freeTimeParticipantIds:f.freeTimeParticipantIds??[]}));
            }else if(mode==="transport"){
              setForm(f=>({...f,activityType:"transport",title:f.title||t("transport"),transportType:f.transportType||"Flight",customTransport:f.customTransport||"",freeTimeParticipantIds:[]}));
            }else{
              setForm(f=>({...f,activityType:"regular",title:f.title===t("freeTime")?"":f.title,freeTimeParticipantIds:[]}));
            }
          }}
        >
          {ACTIVITY_TYPE_OPTIONS.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}
        </Select>
        {form.activityType==="transport"&&<>
          <Select th={th} label={t("transportType")} value={form.transportType} onChange={e=>setForm(f=>({...f,transportType:e.target.value}))}>
            {TRANSPORT_OPTIONS.map(option=><option key={option} value={option}>{option}</option>)}
          </Select>
          {form.transportType==="Other"&&<Input th={th} label={t("customTransportType")} value={form.customTransport} onChange={e=>setForm(f=>({...f,customTransport:e.target.value}))}/>}
        </>}
        {form.activityType==="free-time"&&<div>
          <p className={cx("text-sm mb-2",th==="dark"?"text-slate-300":"text-slate-600")}>Invite travelers</p>
          <div className="flex flex-wrap gap-2">
            {trip.members.filter(memberId=>memberId!==user.id).map(memberId=>{
              const traveler=profileMap.get(memberId);
              const selected=form.freeTimeParticipantIds.includes(memberId);
              return <button key={memberId} type="button" onClick={()=>setForm(f=>({...f,freeTimeParticipantIds:selected?f.freeTimeParticipantIds.filter(id=>id!==memberId):[...f.freeTimeParticipantIds,memberId]}))}
                className={cx("px-3 py-1.5 rounded-full text-sm font-medium transition",
                  selected
                    ?(th==="dark"?"bg-cyan-400 text-slate-950":"bg-slate-800 text-white")
                    :(th==="dark"?"bg-white/5 text-slate-400":"bg-slate-100 text-slate-500"))}>
                {traveler?dn(traveler):memberId}
              </button>;
            })}
          </div>
        </div>}
        <Input th={th} label={t("activity")} value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))}/>
        <Select th={th} label={t("timeMode")} value={form.timeMode} onChange={e=>{
          const nextMode=e.target.value as "timed"|"whole-day";
          setForm(f=>nextMode==="whole-day"
            ? {...f,timeMode:nextMode,startTime:"00:00",endTime:"23:59",endDayOffset:Math.max((f.dayCount||1)-1,0)}
            : {...f,timeMode:nextMode,startTime:f.startTime==="00:00"?"09:00":f.startTime,endTime:f.endTime==="23:59"?"10:00":f.endTime,endDayOffset:0,dayCount:1});
        }}>
          <option value="timed">{t("timed")}</option>
          <option value="whole-day">{t("wholeDay")}</option>
        </Select>
        <Input th={th} label={t("startTime")} type="time" value={form.startTime} onChange={e=>setForm(f=>({...f,startTime:e.target.value}))}/>
        <Input th={th} label={t("endTime")} type="time" value={form.endTime} onChange={e=>setForm(f=>({...f,endTime:e.target.value}))}/>
        {form.timeMode==="whole-day"&&<Input th={th} label={t("numberOfDays")} type="number" min={1} value={form.dayCount} onChange={e=>{
          const dayCount=Math.max(Number(e.target.value)||1,1);
          setForm(f=>({...f,dayCount,endDayOffset:dayCount-1,startTime:"00:00",endTime:"23:59"}));
        }}/>}
        <Input th={th} label={t("stopLocation")} value={form.stopLocation} onChange={e=>setForm(f=>({...f,stopLocation:e.target.value,mapUrl:googleMapEmbedUrl(e.target.value)}))}/>
        <Input th={th} label={t("googleMapUrl")} value={form.mapUrl} onChange={e=>setForm(f=>({...f,mapUrl:e.target.value}))}/>
        <Select th={th} label="Media Size" value={form.mediaSize} onChange={e=>setForm(f=>({...f,mediaSize:e.target.value as "small"|"medium"|"large"}))}>
          <option value="small">Small</option>
          <option value="medium">Medium</option>
          <option value="large">Large</option>
        </Select>
        {form.mapUrl&&<iframe src={form.mapUrl} title="activity-map-preview" loading="lazy" className={cx("w-full rounded-2xl border border-white/10",mediaClassBySize[form.mediaSize])}/>}
        <div className="space-y-2">
          <label className={cx("file-label",th==="dark"?"bg-white/5 text-slate-300 hover:bg-white/10":"bg-slate-100 text-slate-700 hover:bg-slate-200")}>🖼 {t("uploadPhoto")}<input type="file" accept="image/*" onChange={handlePhotoUpload}/></label>
          <Input th={th} label={t("photoUrl")} value={form.photo} onChange={e=>setForm(f=>({...f,photo:e.target.value}))}/>
          {form.photo&&<img src={form.photo} alt="preview" className={cx("w-full rounded-2xl border border-white/10 object-contain bg-slate-100/30",mediaClassBySize[form.mediaSize])}/>}
        </div>
        <Textarea th={th} label={t("remarks")} value={form.details} onChange={e=>setForm(f=>({...f,details:e.target.value}))}/>
        <label className={cx("flex items-center gap-2 rounded-xl border px-3 py-2 text-sm",th==="dark"?"border-white/10 bg-white/[0.03]":"border-slate-200 bg-slate-50")}>
          <input type="checkbox" checked={form.needsFollowUp} onChange={e=>setForm(f=>({...f,needsFollowUp:e.target.checked,followUpNote:e.target.checked?f.followUpNote:""}))}/>
          {t("needFollowUp")}
        </label>
        {form.needsFollowUp&&<Input th={th} label={t("followUpNote")} placeholder={t("followUpPlaceholder")} value={form.followUpNote} onChange={e=>setForm(f=>({...f,followUpNote:e.target.value}))}/>}
        <Btn th={th} type="submit" disabled={!(canEdit || (form.activityType==="free-time"&&canEditFreeTime))}>{editId?t("save"):t("add")}</Btn>
        {editId&&<Btn th={th} v="sec" type="button" onClick={()=>{setEditId(null);setForm(emptyForm);}} disabled={!(canEdit || (form.activityType==="free-time"&&canEditFreeTime))}>{t("cancel")}</Btn>}
      </form> : <form onSubmit={saveOptionalStop} className="space-y-3">
        <Input th={th} label={t("day")} type="number" min={1} max={trip.duration} value={optionalForm.day} onChange={e=>setOptionalForm(f=>({...f,day:Number(e.target.value)||1}))}/>
        <Select th={th} label={t("placeType")} value={optionalForm.type} onChange={e=>setOptionalForm(f=>({...f,type:e.target.value as OptionalStop["type"]}))}>
          <option value="site">{t("sight")}</option>
          <option value="restaurant">{t("restaurant")}</option>
          <option value="other">{t("other")}</option>
        </Select>
        <Input th={th} label={t("placeName")} value={optionalForm.title} onChange={e=>setOptionalForm(f=>({...f,title:e.target.value}))}/>
        <Input th={th} label={t("optionalLocation")} value={optionalForm.location} onChange={e=>setOptionalForm(f=>({...f,location:e.target.value,mapUrl:googleMapEmbedUrl(e.target.value)}))}/>
        <Input th={th} label={t("googleMapUrl")} value={optionalForm.mapUrl} onChange={e=>setOptionalForm(f=>({...f,mapUrl:e.target.value}))}/>
        {optionalForm.mapUrl&&<iframe src={optionalForm.mapUrl} title="optional-map-preview" loading="lazy" className="h-36 w-full rounded-2xl border border-white/10"/>}
        <Input th={th} label={t("reservationLink")} value={optionalForm.url} onChange={e=>setOptionalForm(f=>({...f,url:e.target.value}))}/>
        <Textarea th={th} label={t("optionalPlaceNotes")} value={optionalForm.notes} onChange={e=>setOptionalForm(f=>({...f,notes:e.target.value}))}/>
        <Btn th={th} type="submit" disabled={!canEdit}>{optionalEditId?t("save"):t("saveOptionalPlace")}</Btn>
        {optionalEditId&&<Btn th={th} v="sec" type="button" onClick={()=>{setOptionalEditId(null);setOptionalForm({...emptyOptionalForm,day});}} disabled={!canEdit}>{t("cancel")}</Btn>}
      </form>}
    </Card>
  </div>;
}

function TripExpenses({trip,user,canEdit,profiles,th,t,onAdd,onUpdateExpense,onRemove}:{trip:Trip;user:Profile;canEdit:boolean;profiles:Profile[];th:ThemeMode;t:(k:TKey)=>string;onAdd:(tid:string,e:Omit<Expense,"id">)=>void;onUpdateExpense:(tid:string,eid:string,e:Omit<Expense,"id">)=>void;onRemove:(tid:string,eid:string)=>void}){
  const [form,setForm]=useState({date:new Date().toISOString().slice(0,10),title:"",amount:0,currency:"USD",category:"Food",paidBy:user.id,participants:[] as string[],notes:"",splitType:"equal" as "equal"|"custom",customSplits:{} as Record<string, number>});
  const [showForm,setShowForm]=useState(false);
  const [editingExpenseId,setEditingExpenseId]=useState<string|null>(null);
  const [editForm,setEditForm]=useState({date:new Date().toISOString().slice(0,10),title:"",amount:0,currency:"USD",category:"Food",paidBy:user.id,participants:[] as string[],notes:"",splitType:"equal" as "equal"|"custom",customSplits:{} as Record<string, number>});
  const [formError,setFormError]=useState("");
  const [editFormError,setEditFormError]=useState("");

  const members=trip.members.map(id=>profiles.find(p=>p.id===id)).filter(Boolean) as Profile[];
  const expenseCurrencies=[...new Set(trip.expenses.map(exp=>exp.currency || "USD"))];
  const settlementByCurrency = Object.fromEntries(expenseCurrencies.map(currency=>[currency,settlements(trip,profiles,currency)]));
  const myBalByCurrency = Object.fromEntries(expenseCurrencies.map(currency=>[currency,settlementByCurrency[currency].bal.find(b=>b.id===user.id)]));
  const totalsByCurrency = trip.expenses.reduce<Record<string, number>>((acc,expense)=>{
    const cur = expense.currency || "USD";
    acc[cur] = (acc[cur] ?? 0) + expense.amount;
    return acc;
  },{});

  const toggleParticipant=(pid:string)=>{
    setForm(f=>({...f,participants:f.participants.includes(pid)?f.participants.filter(x=>x!==pid):[...f.participants,pid]}));
  };

  const add=(e:React.FormEvent)=>{
    e.preventDefault();
    if(!canEdit) return;
    if(!form.title.trim()||form.amount<=0)return;
    const included = form.participants.length?form.participants:members.map(m=>m.id);
    const payload = {...form,participants:included,customSplits:form.splitType==="custom"?form.customSplits:{}};
    const customTotal = included.reduce((sum,pid)=>sum + Number(payload.customSplits[pid] ?? 0),0);
    if(form.splitType==="custom" && Math.abs(customTotal-form.amount)>0.01){
      setFormError(`Custom split total (${fmtCur(customTotal,form.currency)}) must equal amount (${fmtCur(form.amount,form.currency)}).`);
      return;
    }
    setFormError("");
    onAdd(trip.id,payload);
    setForm({date:new Date().toISOString().slice(0,10),title:"",amount:0,currency:"USD",category:"Food",paidBy:user.id,participants:[],notes:"",splitType:"equal",customSplits:{}});
    setShowForm(false);
  };

  const perPerson=form.amount/(form.participants.length||members.length||1);
  const editPerPerson=editForm.amount/(editForm.participants.length||members.length||1);
  const toggleEditParticipant=(pid:string)=>{
    setEditForm(f=>({...f,participants:f.participants.includes(pid)?f.participants.filter(x=>x!==pid):[...f.participants,pid]}));
  };
  const startEdit=(expense:Expense)=>{
    setEditingExpenseId(expense.id);
    setEditForm({
      date:expense.date,title:expense.title,amount:expense.amount,currency:expense.currency,
      category:expense.category,paidBy:expense.paidBy,participants:[...expense.participants],notes:expense.notes,
      splitType:expense.splitType==="custom"?"custom":"equal",customSplits:expense.customSplits ?? {},
    });
  };
  const saveEdit=(e:React.FormEvent)=>{
    e.preventDefault();
    if(!editingExpenseId||!canEdit) return;
    if(!editForm.title.trim()||editForm.amount<=0)return;
    const included = editForm.participants.length?editForm.participants:members.map(m=>m.id);
    const payload = {...editForm,participants:included,customSplits:editForm.splitType==="custom"?editForm.customSplits:{}};
    const customTotal = included.reduce((sum,pid)=>sum + Number(payload.customSplits[pid] ?? 0),0);
    if(editForm.splitType==="custom" && Math.abs(customTotal-editForm.amount)>0.01){
      setEditFormError(`Custom split total (${fmtCur(customTotal,editForm.currency)}) must equal amount (${fmtCur(editForm.amount,editForm.currency)}).`);
      return;
    }
    setEditFormError("");
    onUpdateExpense(trip.id,editingExpenseId,payload);
    setEditingExpenseId(null);
  };

  return <div className="grid min-w-0 lg:grid-cols-3 gap-4 sm:gap-6">
    <div className="min-w-0 lg:col-span-2 space-y-4 sm:space-y-6">
      <Card th={th} className="p-5 sm:p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">{t("expenses")}</h2>
          <Btn th={th} onClick={()=>setShowForm(true)} disabled={!canEdit}>+ {t("addExpense")}</Btn>
        </div>
        {!canEdit&&<p className={cx("mb-4 text-sm",th==="dark"?"text-slate-400":"text-slate-500")}>{t("joinersCanEditExpenses")}</p>}

        {/* Balance Summary */}
        {expenseCurrencies.length>0&&<Card th={th} className="p-4 sm:p-6 mb-6 bg-gradient-to-br from-blue-500/10 to-purple-500/10">
          <h3 className="text-xl font-bold mb-4">{t("balanceSummary")}</h3>
          <div className="space-y-3">
            {expenseCurrencies.map(currency=>{
              const myBal=myBalByCurrency[currency];
              if(!myBal) return null;
              return <div key={currency} className={cx("rounded-2xl border p-3",th==="dark"?"border-white/10 bg-white/[0.04]":"border-slate-200 bg-white")}>
                <p className={cx("text-xs mb-2",th==="dark"?"text-slate-400":"text-slate-500")}>{currency}</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <p>{t("totalPaid")}: <span className="font-bold text-emerald-400">{fmtCur(myBal.paid,currency)}</span></p>
                  <p>{t("myShare")}: <span className="font-bold text-amber-400">{fmtCur(myBal.share,currency)}</span></p>
                  <p>{t("iOwe")}: <span className={cx("font-bold",myBal.net<0?"text-rose-400":"text-cyan-400")}>{myBal.net<0?fmtCur(Math.abs(myBal.net),currency):"—"}</span></p>
                </div>
              </div>;
            })}
          </div>
          <p className={cx("mt-3 text-xs",th==="dark"?"text-slate-400":"text-slate-500")}>
            Totals: {Object.entries(totalsByCurrency).map(([currency,total])=>fmtCur(total,currency)).join(" · ")}
          </p>
        </Card>}

        {trip.expenses.length===0?<Empty icon="💰" title={t("noExpenses")} desc={t("noExpensesDesc")} th={th}/>
        :<div className="space-y-5">
          {expenseCurrencies.map(currency=><div key={currency} className="space-y-3">
            <p className={cx("text-sm font-semibold",th==="dark"?"text-cyan-300":"text-blue-700")}>{currency}</p>
            {trip.expenses.filter(exp=>exp.currency===currency).map(exp=>{
            const payer=members.find(m=>m.id===exp.paidBy);
            return <Card key={exp.id} th={th} className="p-4 sm:p-5">
              <div className="flex flex-col sm:flex-row items-start justify-between gap-3 sm:gap-4">
                <div className="flex-1">
                  <div className="flex flex-col sm:flex-row items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="font-bold text-lg break-words">{exp.title}</p>
                      <p className={cx("text-sm",th==="dark"?"text-slate-400":"text-slate-500")}>
                        {fmtDate(exp.date)} · {expenseCategoryLabel(exp.category,t)}
                      </p>
                    </div>
                    <p className="text-2xl font-bold text-cyan-400">{fmtCur(exp.amount,exp.currency)}</p>
                  </div>
                  <p className={cx("text-sm break-words",th==="dark"?"text-slate-400":"text-slate-500")}>
                    {t("paidBy")}: {payer?dn(payer):t("unknown")} · {t("splitWith")}: {exp.participants.length||members.length} {t("members")}
                    {exp.participants.length>0&&<span className="ml-2">
                      ({exp.participants.map(pid=>members.find(m=>m.id===pid)).filter(Boolean).map(m=>dn(m!)).join(", ")})
                    </span>}
                  </p>
                  {exp.notes&&<p className={cx("text-sm mt-1",th==="dark"?"text-slate-300":"text-slate-600")}>{exp.notes}</p>}
                </div>
                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <Btn th={th} v="sec" sz="sm" onClick={()=>startEdit(exp)} disabled={!canEdit}>{t("edit")}</Btn>
                  <button onClick={()=>onRemove(trip.id,exp.id)} disabled={!canEdit} className="opacity-60 hover:opacity-100 text-rose-400 text-xl disabled:opacity-30">✕</button>
                </div>
              </div>
            </Card>;
            })}
          </div>)}
        </div>}
      </Card>

      {expenseCurrencies.some(currency=>settlementByCurrency[currency].sett.length>0)&&<Card th={th} className="p-5 sm:p-8">
        <h3 className="text-xl font-bold mb-4">{t("settlements")}</h3>
        <div className="space-y-4">
          {expenseCurrencies.map(currency=>settlementByCurrency[currency].sett.length>0&&<div key={currency} className="space-y-2">
            <p className={cx("text-sm font-semibold",th==="dark"?"text-cyan-300":"text-blue-700")}>{currency}</p>
            {settlementByCurrency[currency].sett.map((s,i)=><p key={`${currency}-${i}`} className={cx("text-sm",th==="dark"?"text-slate-300":"text-slate-600")}>
              <span className="font-semibold">{s.from}</span> {t("owes")} <span className="font-semibold">{s.to}</span>: <span className="text-cyan-400 font-bold">{fmtCur(s.amount,currency)}</span>
            </p>)}
          </div>)}
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
          {EXPENSE_CATS.map(c=><option key={c} value={c}>{expenseCategoryLabel(c,t)}</option>)}
        </Select>
        <Select th={th} label={t("paidBy")} value={form.paidBy} onChange={e=>setForm(f=>({...f,paidBy:e.target.value}))}>
          {members.map(m=><option key={m.id} value={m.id}>{dn(m)}</option>)}
        </Select>
        <Select th={th} label={t("splitMode")} value={form.splitType} onChange={e=>setForm(f=>({...f,splitType:e.target.value as "equal"|"custom"}))}>
          <option value="equal">{t("splitModeEqual")}</option>
          <option value="custom">{t("splitModeCustom")}</option>
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
          {form.splitType==="equal"
            ? <p className={cx("text-sm mt-2",th==="dark"?"text-slate-400":"text-slate-500")}>{t("perPerson")}: {fmtCur(perPerson,form.currency)}</p>
            : <div className="mt-2 space-y-2">
              {(form.participants.length?form.participants:members.map(m=>m.id)).map(pid=>{
                const member=members.find(m=>m.id===pid);
                return <Input key={pid} th={th} label={member?dn(member):pid} type="number" step="0.01" value={form.customSplits[pid] ?? 0}
                  onChange={e=>setForm(f=>({...f,customSplits:{...f.customSplits,[pid]:Number(e.target.value||0)}}))}/>;
              })}
            </div>}
        </div>
        <Textarea th={th} label={t("expNotes")} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/>
        {formError&&<p className="text-sm text-rose-400">{formError}</p>}
        <Btn th={th} type="submit">{t("add")}</Btn>
      </form>
    </Modal>
    <Modal open={Boolean(editingExpenseId)} onClose={()=>setEditingExpenseId(null)} th={th} title={t("editExpense")}>
      <form onSubmit={saveEdit} className="space-y-4">
        <Input th={th} label={t("date")} type="date" value={editForm.date} onChange={e=>setEditForm(f=>({...f,date:e.target.value}))}/>
        <Input th={th} label={t("activity")} value={editForm.title} onChange={e=>setEditForm(f=>({...f,title:e.target.value}))}/>
        <div className="grid grid-cols-2 gap-3">
          <Input th={th} label={t("amount")} type="number" step="0.01" value={editForm.amount||""} onChange={e=>setEditForm(f=>({...f,amount:+e.target.value}))}/>
          <Select th={th} label={t("currency")} value={editForm.currency} onChange={e=>setEditForm(f=>({...f,currency:e.target.value}))}>
            {CURRENCIES.map(c=><option key={c} value={c}>{c}</option>)}
          </Select>
        </div>
        <Select th={th} label={t("category")} value={editForm.category} onChange={e=>setEditForm(f=>({...f,category:e.target.value}))}>
          {EXPENSE_CATS.map(c=><option key={c} value={c}>{expenseCategoryLabel(c,t)}</option>)}
        </Select>
        <Select th={th} label={t("paidBy")} value={editForm.paidBy} onChange={e=>setEditForm(f=>({...f,paidBy:e.target.value}))}>
          {members.map(m=><option key={m.id} value={m.id}>{dn(m)}</option>)}
        </Select>
        <Select th={th} label={t("splitMode")} value={editForm.splitType} onChange={e=>setEditForm(f=>({...f,splitType:e.target.value as "equal"|"custom"}))}>
          <option value="equal">{t("splitModeEqual")}</option>
          <option value="custom">{t("splitModeCustom")}</option>
        </Select>
        <div>
          <p className={cx("text-sm mb-2",th==="dark"?"text-slate-300":"text-slate-600")}>{t("splitWith")} ({editForm.participants.length||members.length})</p>
          <div className="flex flex-wrap gap-2">
            {members.map(m=><button key={m.id} type="button" onClick={()=>toggleEditParticipant(m.id)}
              className={cx("px-3 py-1.5 rounded-full text-sm font-medium transition",
                editForm.participants.includes(m.id)||(editForm.participants.length===0)
                  ?(th==="dark"?"bg-cyan-400 text-slate-950":"bg-slate-800 text-white")
                  :(th==="dark"?"bg-white/5 text-slate-400":"bg-slate-100 text-slate-500"))}>
              {dn(m)}
            </button>)}
          </div>
          {editForm.splitType==="equal"
            ? <p className={cx("text-sm mt-2",th==="dark"?"text-slate-400":"text-slate-500")}>{t("perPerson")}: {fmtCur(editPerPerson,editForm.currency)}</p>
            : <div className="mt-2 space-y-2">
              {(editForm.participants.length?editForm.participants:members.map(m=>m.id)).map(pid=>{
                const member=members.find(m=>m.id===pid);
                return <Input key={pid} th={th} label={member?dn(member):pid} type="number" step="0.01" value={editForm.customSplits[pid] ?? 0}
                  onChange={e=>setEditForm(f=>({...f,customSplits:{...f.customSplits,[pid]:Number(e.target.value||0)}}))}/>;
              })}
            </div>}
        </div>
        <Textarea th={th} label={t("expNotes")} value={editForm.notes} onChange={e=>setEditForm(f=>({...f,notes:e.target.value}))}/>
        {editFormError&&<p className="text-sm text-rose-400">{editFormError}</p>}
        <Btn th={th} type="submit">{t("save")}</Btn>
      </form>
    </Modal>
  </div>;
}

function TripLuggage({trip,user,isOwner,siteCfg,th,t,onAdd,onToggle,onRemove,onAddShared,onRemoveShared}:{trip:Trip;user:Profile;isOwner:boolean;siteCfg:SiteSettings;th:ThemeMode;t:(k:TKey)=>string;onAdd:(tid:string,l:string,cat:string)=>void;onToggle:(tid:string,iid:string)=>void;onRemove:(tid:string,iid:string)=>void;onAddShared:(tid:string,l:string,cat:string)=>void;onRemoveShared:(tid:string,iid:string)=>void}){
  const isMobileScreen=useMobileScreen();
  const [cat,setCat]=useState<string>("all");
  const [mobileCategory,setMobileCategory]=useState<string>("all");
  const [newItem,setNewItem]=useState("");
  const [newSharedItem,setNewSharedItem]=useState("");
  const [monthlyClimate,setMonthlyClimate]=useState<WeatherData["monthlyClimate"]>([]);
  const [climateLoading,setClimateLoading]=useState(false);

  const cats=siteCfg.luggageCategories||[];
  const visibleItems=(trip.packingList ?? []).filter(item=>item.isSharedDefault || item.createdById===user.id || item.assignedTo===dn(user));
  const categoryNames = useMemo(()=>{
    const configured = cats.map(category=>category.name).filter(Boolean);
    const existing = visibleItems.map(item=>item.category).filter(Boolean);
    return Array.from(new Set([...configured, ...existing]));
  },[cats,visibleItems]);
  const isPackedByUser = (item:PackingItem)=>Boolean(item.packedBy?.[user.id] ?? item.packedBy?.legacy ?? item.packed);
  const filteredItems=cat==="all"?visibleItems:visibleItems.filter(it=>it.category===cat);
  const packed=filteredItems.filter(it=>isPackedByUser(it)).length;
  const packedPct=filteredItems.length?Math.round((packed/filteredItems.length)*100):0;
  const groupedItems=(cat==="all"?categoryNames:[cat]).map(categoryName=>({
    categoryName,
    items: filteredItems.filter(item=>item.category===categoryName),
  })).filter(group=>group.items.length>0);
  const groupsToRender=isMobileScreen?groupedItems.filter(group=>group.categoryName===mobileCategory):groupedItems;
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
    const category=cat==="all"?cats[0]?.name||categoryNames[0]||"Misc":cat;
    onAdd(trip.id,newItem.trim(),category);
    setNewItem("");
  };
  const addShared=(e:React.FormEvent)=>{
    e.preventDefault();
    if(!newSharedItem.trim()) return;
    const category=cat==="all"?cats[0]?.name||categoryNames[0]||"Misc":cat;
    onAddShared(trip.id,newSharedItem.trim(),category);
    setNewSharedItem("");
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
  useEffect(()=>{
    if(groupedItems.length===0){
      setMobileCategory("all");
      return;
    }
    if(!groupedItems.find(group=>group.categoryName===mobileCategory)){
      setMobileCategory(groupedItems[0].categoryName);
    }
  },[groupedItems,mobileCategory]);

  return <div className="grid min-w-0 lg:grid-cols-3 gap-4 sm:gap-6">
    <div className="min-w-0 lg:col-span-2">
      <Card th={th} className="p-5 sm:p-8">
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
          {categoryNames.map(categoryName=><button key={categoryName} onClick={()=>setCat(categoryName)} className={cx("px-4 py-2 rounded-full font-medium whitespace-nowrap transition",
            cat===categoryName?(th==="dark"?"bg-cyan-400 text-slate-950":"bg-slate-800 text-white")
              :(th==="dark"?"bg-white/5 text-slate-400 hover:bg-white/10":"bg-slate-100 text-slate-600 hover:bg-slate-200"))}>
            {categoryName}
          </button>)}
        </div>
        {isMobileScreen&&<div className="mb-4">
          <Select th={th} label={t("categories")} value={mobileCategory} onChange={e=>setMobileCategory(e.target.value)}>
            {groupedItems.map(group=><option key={group.categoryName} value={group.categoryName}>{group.categoryName}</option>)}
          </Select>
        </div>}
        <div className="mb-4 flex flex-wrap gap-2">
          {cats.map(c=><Badge key={c.id} label={c.name} th={th} color="slate"/>)}
        </div>

        <form onSubmit={add} className="flex flex-col sm:flex-row gap-2 mb-6">
          <Input th={th} value={newItem} onChange={e=>setNewItem(e.target.value)} placeholder={t("itemName")} className="flex-1"/>
          <Btn th={th} type="submit">+ {t("add")}</Btn>
        </form>
        {isOwner&&<form onSubmit={addShared} className="flex flex-col sm:flex-row gap-2 mb-6">
          <Input th={th} value={newSharedItem} onChange={e=>setNewSharedItem(e.target.value)} placeholder={t("ownerDefaultItemPlaceholder")} className="flex-1"/>
          <Btn th={th} v="sec" type="submit">+ {t("addSharedDefault")}</Btn>
        </form>}

        {filteredItems.length===0?<Empty icon="🧳" title={t("noLuggage")} desc={t("noLuggageDesc")} th={th}/>
        :<div className="space-y-6">
          {groupsToRender.map(group=><div key={group.categoryName} className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg">{group.categoryName}</h3>
              <p className={cx("text-sm",th==="dark"?"text-slate-400":"text-slate-500")}>{group.items.filter(item=>isPackedByUser(item)).length}/{group.items.length}</p>
            </div>
            <div className="space-y-2">
              {group.items.map(it=><div key={it.id} className={cx("flex items-center gap-4 rounded-2xl border px-4 py-4 transition",th==="dark"?"border-white/8 bg-white/[0.03] hover:bg-white/[0.06]":"border-slate-200 bg-white/80 hover:bg-white")}>
                <button type="button" onClick={()=>onToggle(trip.id,it.id)} className={cx("flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-sm font-bold transition",isPackedByUser(it)?"border-cyan-400 bg-cyan-400 text-slate-950":(th==="dark"?"border-white/15 text-transparent hover:border-cyan-400":"border-slate-300 text-transparent hover:border-slate-500"))}>✓</button>
                <div className="flex-1 min-w-0">
                  <p className={cx("font-medium",isPackedByUser(it)&&"line-through opacity-50")}>{it.label}</p>
                  <p className={cx("text-xs mt-1",th==="dark"?"text-slate-500":"text-slate-400")}>{it.isSharedDefault?"Shared default":it.assignedTo}</p>
                </div>
                <button type="button" onClick={()=>it.isSharedDefault?onRemoveShared(trip.id,it.id):onRemove(trip.id,it.id)} className="text-rose-400 opacity-70 hover:opacity-100" disabled={it.isSharedDefault&&!isOwner}>✕</button>
              </div>)}
            </div>
          </div>)}
        </div>}
      </Card>
    </div>

    <Card th={th} className="p-5 sm:p-6 space-y-4">
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

function TripInstructions({th,t}:{th:ThemeMode;t:(k:TKey)=>string}){
  const steps=[
    {title:t("instructionOverviewTitle"),desc:t("instructionOverviewDesc")},
    {title:t("instructionTravelersTitle"),desc:t("instructionTravelersDesc")},
    {title:t("instructionItineraryTitle"),desc:t("instructionItineraryDesc")},
    {title:t("instructionExpensesTitle"),desc:t("instructionExpensesDesc")},
    {title:t("instructionLuggageTitle"),desc:t("instructionLuggageDesc")},
    {title:t("instructionSettingsTitle"),desc:t("instructionSettingsDesc")},
  ];

  return <Card th={th} className="p-5 sm:p-8 space-y-5">
    <h2 className="text-2xl font-bold">{t("instructionsTitle")}</h2>
    <p className={cx("text-sm",th==="dark"?"text-slate-400":"text-slate-500")}>{t("instructionsIntro")}</p>
    <div className="grid gap-3">
      {steps.map((step,index)=><div key={step.title} className={cx("rounded-2xl border p-4",th==="dark"?"border-white/10 bg-white/[0.03]":"border-slate-200 bg-slate-50")}>
        <p className="font-semibold">{index+1}. {step.title}</p>
        <p className={cx("mt-1 text-sm",th==="dark"?"text-slate-300":"text-slate-600")}>{step.desc}</p>
      </div>)}
    </div>
  </Card>;
}

function TripSettings({trip,profiles,canEdit,isOwner,siteCfg,th,t,onUpdate,onDeleteTrip,onBack,onLeaveTrip}:{trip:Trip;profiles:Profile[];canEdit:boolean;isOwner:boolean;siteCfg:SiteSettings;th:ThemeMode;t:(k:TKey)=>string;onUpdate:(id:string,d:Partial<Trip>)=>void;onDeleteTrip:(id:string)=>void;onBack:()=>void;onLeaveTrip:(tripId:string)=>void;}){
  const normalizeSettingsFormTrip=(input:Trip)=>({
    ...input,
    flightLegs:Array.isArray(input.flightLegs)?input.flightLegs:[],
    hotels:Array.isArray(input.hotels)?input.hotels:[],
    itinerary:Array.isArray(input.itinerary)?input.itinerary:[],
    travelNotes:Array.isArray(input.travelNotes)?input.travelNotes:[],
    members:Array.isArray(input.members)?input.members:[],
    expenses:Array.isArray(input.expenses)?input.expenses:[],
    weatherLocations:Array.isArray(input.weatherLocations)?input.weatherLocations:undefined,
    reminderTemplate:normalizeReminderTemplate(input.reminderTemplate),
    bannerImageUrl:"",
  });
  const isMobileScreen=useMobileScreen();
  const [form,setForm]=useState(()=>normalizeSettingsFormTrip(trip));
  const [saved,setSaved]=useState(false);
  const [bannerMessage,setBannerMessage]=useState("");
  const [flightMessage,setFlightMessage]=useState("");
  const [hotelMessage,setHotelMessage]=useState("");
  const [flightSearchingId,setFlightSearchingId]=useState<string|null>(null);
  const [hotelSearchingId,setHotelSearchingId]=useState<string|null>(null);
  const [hasUnsavedChanges,setHasUnsavedChanges]=useState(false);
  const [mobileDetailSection,setMobileDetailSection]=useState<"none"|"flights"|"hotels"|"weather"|"banner">("none");
  const [expandedFlightIds,setExpandedFlightIds]=useState<string[]>([]);
  const [expandedHotelIds,setExpandedHotelIds]=useState<string[]>([]);
  const [weatherQuery,setWeatherQuery]=useState("");
  const [weatherSearching,setWeatherSearching]=useState(false);
  const [weatherSearchResults,setWeatherSearchResults]=useState<GeoSearchResult[]>([]);
  const [selectedWeatherResult,setSelectedWeatherResult]=useState<string>("");
  const [weatherStartDay,setWeatherStartDay]=useState(1);
  const [weatherEndDay,setWeatherEndDay]=useState(Math.max(1, trip.duration));
  const [sendingReminder,setSendingReminder]=useState(false);
  const reminderTemplate = normalizeReminderTemplate(form.reminderTemplate);
  const ownerOrEditors = trip.members
    .map(id=>profiles.find(profile=>profile.id===id))
    .filter((member):member is Profile=>Boolean(member))
    .filter(member=>{
      const role = getTripRole(trip, member.id);
      return role==="owner" || role==="editor";
    });

  useEffect(()=>{
    setForm(normalizeSettingsFormTrip(trip));
    setHasUnsavedChanges(false);
    setExpandedFlightIds([]);
    setExpandedHotelIds([]);
    setWeatherStartDay(1);
    setWeatherEndDay(Math.max(1, trip.duration));
    setWeatherQuery("");
    setWeatherSearchResults([]);
    setSelectedWeatherResult("");
  },[trip]);
  useEffect(()=>{
    const baseline = JSON.stringify(normalizeSettingsFormTrip(trip));
    const current = JSON.stringify(form);
    setHasUnsavedChanges(current!==baseline);
  },[form,trip]);


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
    setHasUnsavedChanges(false);
    setSaved(true);
    setTimeout(()=>setSaved(false),2000);
  };
  const removeTrip=()=>{
    if(!isOwner) return;
    const firstOk=window.confirm(`${t("deleteTripConfirm")} "${trip.title}"`);
    if(!firstOk) return;
    const secondOk=window.confirm(`Please reconfirm: permanently delete "${trip.title}"?`);
    if(!secondOk) return;
    onDeleteTrip(trip.id);
    onBack();
  };
  const leaveTrip=()=>{
    if(isOwner) return;
    const ok=window.confirm(`Leave "${trip.title}"?`);
    if(!ok) return;
    onLeaveTrip(trip.id);
    onBack();
  };

  const handleBannerUpload=async(e:ChangeEvent<HTMLInputElement>)=>{
    const file=e.target.files?.[0];if(!file)return;
    try{
      const url=await readImageFile(file);
      setForm(f=>({...f,bannerImage:url}));
      setBannerMessage(t("bannerUploadedRememberSave"));
    }catch(error){
      setBannerMessage(error instanceof Error ? error.message : t("bannerUploadFailed"));
    }finally{
      e.target.value="";
    }
  };

  const setBannerUrl=()=>{
    if(form.bannerImageUrl.trim()){
      setForm(f=>({...f,bannerImage:f.bannerImageUrl.trim(),bannerImageUrl:""}));
    }
  };

  const updateLeg=(legId:string,patch:Partial<FlightLeg>)=>setForm(f=>({...f,flightLegs:f.flightLegs.map(leg=>leg.id===legId?{...leg,...patch}:leg)}));
  const addLeg=()=>{
    const leg={id:uid("flt"),airline:"",flightNumber:"",departureAirport:"",arrivalAirport:"",departureTime:"",arrivalTime:"",terminal:"",bookingReference:"",notes:""};
    setForm(f=>({...f,flightLegs:[leg,...f.flightLegs]}));
    setExpandedFlightIds(ids=>[leg.id,...ids]);
  };
  const removeLeg=(legId:string)=>{
    setForm(f=>({...f,flightLegs:f.flightLegs.filter(leg=>leg.id!==legId)}));
    setExpandedFlightIds(ids=>ids.filter(id=>id!==legId));
  };
  const updateHotel=(hotelId:string,patch:Partial<HotelStay>)=>setForm(f=>({...f,hotels:f.hotels.map(hotel=>hotel.id===hotelId?{...hotel,...patch}:hotel)}));
  const addHotel=()=>{
    const nextHotel={id:uid("htl"),hotelName:"",hotelAddress:"",roomType:"",checkIn:"",checkOut:"",confirmationCode:"",contact:"",notes:""};
    setForm(f=>({...f,hotels:[nextHotel,...f.hotels]}));
    setExpandedHotelIds(ids=>[nextHotel.id,...ids]);
  };
  const removeHotel=(hotelId:string)=>{
    setForm(f=>({...f,hotels:f.hotels.filter(hotel=>hotel.id!==hotelId)}));
    setExpandedHotelIds(ids=>ids.filter(id=>id!==hotelId));
  };

  const searchWeatherLocations=async()=>{
    if(!weatherQuery.trim()) return;
    setWeatherSearching(true);
    setWeatherSearchResults(await searchLocations(siteCfg, weatherQuery));
    setWeatherSearching(false);
  };

  const addWeatherLocationPlan=()=>{
    const selected = weatherSearchResults.find(item=>`${item.name}-${item.lat}-${item.lon}`===selectedWeatherResult);
    if(!selected) return;
    const startDay = Math.max(1, Math.min(weatherStartDay, form.duration || 1));
    const endDay = Math.max(1, Math.min(weatherEndDay, form.duration || 1));
    const plan = {
      id: uid("wloc"),
      label: `${selected.name}${selected.subtitle ? ` (${selected.subtitle})` : ""}`,
      startDay: Math.min(startDay, endDay),
      endDay: Math.max(startDay, endDay),
      location: { name: selected.name, lat: selected.lat, lon: selected.lon },
    };
    setForm(f=>({
      ...f,
      weatherLocations: [...(f.weatherLocations ?? []), plan].sort((a,b)=>a.startDay-b.startDay),
      customLocation: plan.location,
    }));
    setSelectedWeatherResult("");
  };
  const updateReminderTemplate = (patch:Partial<ReminderTemplate>)=>{
    setForm(current=>({...current,reminderTemplate:{...normalizeReminderTemplate(current.reminderTemplate),...patch}}));
  };
  const buildReminderBody=()=>{
    const lines:string[]=[reminderTemplate.body.trim()];
    if(reminderTemplate.includeTripTitle) lines.push(`${t("reminderTripTitle")}: ${form.title}`);
    if(reminderTemplate.includeDates) lines.push(`${t("reminderTripDates")}: ${fmtDate(form.startDate)} - ${fmtDate(form.endDate)}`);
    if(reminderTemplate.includeLocation) lines.push(`${t("reminderLocation")}: ${form.location || "—"}`);
    if(reminderTemplate.includeTripId) lines.push(`${t("reminderTripId")}: ${trip.id}`);
    if(reminderTemplate.includeFlightSummary){
      lines.push(`${t("reminderFlightSummary")}: ${tripFlightSummary(form).join(" · ") || t("none")}`);
    }
    if(reminderTemplate.includeHotelSummary){
      lines.push(`${t("reminderHotelSummary")}: ${tripHotelSummary(form).join(" · ") || t("none")}`);
    }
    if(reminderTemplate.includeNotesSummary){
      const { noteTexts, attachmentLinks } = buildReminderNotesSummary(form.travelNotes, t);
      if(noteTexts.length) lines.push(`${t("travelNotes")}: ${noteTexts.join(" | ")}`);
      if(attachmentLinks.length) lines.push(`${t("attachments")}: ${attachmentLinks.join(" | ")}`);
    }
    return lines.filter(Boolean).join("\n\n");
  };
  const sendReminderEmail=()=>{
    const body = buildReminderBody();
    const opened = openReminderDraftInGmail({
      memberIds: trip.members,
      profiles,
      subjectTemplate: reminderTemplate.subject,
      tripTitle: form.title,
      body,
    });
    if(!opened) return;
    setSendingReminder(true);
    setTimeout(()=>setSendingReminder(false),500);
  };

  const removeWeatherLocationPlan=(id:string)=>{
    setForm(f=>({...f, weatherLocations: (f.weatherLocations ?? []).filter(item=>item.id!==id)}));
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

  if(!canEdit){
    return <Card th={th} className="p-5 sm:p-8 text-center">
      <p className={cx("text-lg",th==="dark"?"text-slate-400":"text-slate-500")}>
        ⚙️ {t("settingsOwnerCoOwnerOnly")}
      </p>
      {!isOwner&&<div className="mt-5">
        <Btn th={th} v="danger" onClick={leaveTrip}>Quit trip</Btn>
      </div>}
    </Card>;
  }

  return <Card th={th} className="p-5 sm:p-8 space-y-4 sm:space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-2xl font-bold">{t("tripDetails")}</h2>
      <Btn th={th} onClick={save} className="!bg-emerald-500 !text-white hover:!bg-emerald-400 !shadow-lg shadow-emerald-500/30">💾 {t("save")}</Btn>
    </div>
    <Card th={th} className="p-5 sm:p-6 space-y-4 min-w-0 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-xl font-semibold">{t("reminderEmailCard")}</h3>
        <Btn th={th} v="sec" sz="sm" type="button" onClick={()=>void sendReminderEmail()} disabled={sendingReminder}>
          {sendingReminder ? t("preparing") : t("sendReminderDraft")}
        </Btn>
      </div>
      <p className={cx("text-sm",th==="dark"?"text-slate-400":"text-slate-500")}>{t("reminderEmailSupportText")}</p>
      <Input th={th} label={t("subjectTemplate")} value={reminderTemplate.subject} onChange={e=>updateReminderTemplate({subject:e.target.value})}/>
      <Textarea th={th} label={t("emailBodyTemplate")} value={reminderTemplate.body} onChange={e=>updateReminderTemplate({body:e.target.value})} className="min-h-28"/>
      <div className="grid sm:grid-cols-2 gap-2 text-sm">
        {[
          [t("reminderTripTitle"),"includeTripTitle"],
          [t("reminderTripDates"),"includeDates"],
          [t("reminderLocation"),"includeLocation"],
          [t("reminderTripId"),"includeTripId"],
          [t("reminderFlightSummary"),"includeFlightSummary"],
          [t("reminderHotelSummary"),"includeHotelSummary"],
          [t("reminderNotesLinks"),"includeNotesSummary"],
        ].map(([label,key])=><label key={key} className={cx("rounded-xl border px-3 py-2 flex items-center gap-2",th==="dark"?"border-white/10 bg-white/[0.03]":"border-slate-200 bg-slate-50")}>
          <input type="checkbox" checked={Boolean(reminderTemplate[key as keyof ReminderTemplate])} onChange={e=>updateReminderTemplate({[key]:e.target.checked} as Partial<ReminderTemplate>)}/>
          {label}
        </label>)}
      </div>
      <p className={cx("text-xs",th==="dark"?"text-cyan-300":"text-blue-700")}>
        Available sender accounts (owner/editor): {ownerOrEditors.map(person=>person.email || `@${person.accountName}`).join(", ") || "None"}
      </p>
    </Card>
    {isMobileScreen&&<Card th={th} className="p-4">
      <Select th={th} label={t("moreSettings")} value={mobileDetailSection} onChange={e=>setMobileDetailSection(e.target.value as "none"|"flights"|"hotels"|"weather"|"banner")}>
        <option value="none">{t("none")}</option>
        <option value="flights">{t("flightLegs")}</option>
        <option value="hotels">{t("hotelStays")}</option>
        <option value="weather">{t("weatherLocationSettings")}</option>
        <option value="banner">{t("bannerImage")}</option>
      </Select>
    </Card>}
    <div className="space-y-6">
      {(!isMobileScreen||mobileDetailSection==="flights")&&<Card th={th} className="p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xl font-semibold">{t("flightLegs")}</h3>
          <Btn th={th} v="sec" type="button" onClick={()=>void addLeg()}>+ {t("addLeg")}</Btn>
        </div>
        {form.flightLegs.length===0&&<p className={cx("text-sm",th==="dark"?"text-slate-400":"text-slate-500")}>{t("noFlightDetails")}</p>}
        <p className={cx("text-xs",th==="dark"?"text-slate-400":"text-slate-500")}>{t("flightSearchByNumberHint")}</p>
        {flightMessage&&<p className={cx("text-sm",th==="dark"?"text-cyan-300":"text-blue-700")}>{flightMessage}</p>}
        <div className="space-y-4">
          {form.flightLegs.map((leg,index)=><details key={leg.id} open={expandedFlightIds.includes(leg.id)} className={cx("rounded-3xl border p-4 sm:p-5",th==="dark"?"border-white/8 bg-white/[0.03]":"border-slate-200 bg-slate-50")}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="font-semibold">{t("flightDetails")} {index+1}</p>
                <p className={cx("text-xs",th==="dark"?"text-slate-400":"text-slate-500")}>{t("autoSearchFlight")}</p>
              </div>
              <div className="flex items-center gap-2">
                <Btn th={th} v="ghost" sz="sm" type="button" onClick={(e)=>{e.preventDefault();setExpandedFlightIds(ids=>ids.includes(leg.id)?ids.filter(id=>id!==leg.id):[...ids,leg.id]);}}>
                  {expandedFlightIds.includes(leg.id)?t("collapse"):t("expand")}
                </Btn>
                <Btn th={th} v="sec" sz="sm" type="button" onClick={()=>void autofillFlight(leg)} disabled={flightSearchingId===leg.id}>{flightSearchingId===leg.id?t("loading"):t("search")}</Btn>
                <Btn th={th} v="danger" sz="sm" type="button" onClick={()=>removeLeg(leg.id)}>{t("remove")}</Btn>
              </div>
            </summary>
            <div className="mt-4 grid sm:grid-cols-2 gap-3">
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
          </details>)}
        </div>
      </Card>}

      {(!isMobileScreen||mobileDetailSection==="hotels")&&<Card th={th} className="p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xl font-semibold">{t("hotelStays")}</h3>
          <Btn th={th} v="sec" type="button" onClick={addHotel}>+ {t("addHotel")}</Btn>
        </div>
        {form.hotels.length===0&&<p className={cx("text-sm",th==="dark"?"text-slate-400":"text-slate-500")}>{t("noHotelDetails")}</p>}
        <p className={cx("text-xs",th==="dark"?"text-slate-400":"text-slate-500")}>{t("hotelSearchHint")}</p>
        {hotelMessage&&<p className={cx("text-sm",th==="dark"?"text-cyan-300":"text-blue-700")}>{hotelMessage}</p>}
        <div className="space-y-4">
          {form.hotels.map((hotel,index)=><details key={hotel.id} open={expandedHotelIds.includes(hotel.id)} className={cx("rounded-3xl border p-4 sm:p-5",th==="dark"?"border-white/8 bg-white/[0.03]":"border-slate-200 bg-slate-50")}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="font-semibold">{t("hotelDetails")} {index+1}</p>
                <p className={cx("text-xs",th==="dark"?"text-slate-400":"text-slate-500")}>{t("autoFillHotel")}</p>
              </div>
              <div className="flex items-center gap-2">
                <Btn th={th} v="ghost" sz="sm" type="button" onClick={(e)=>{e.preventDefault();setExpandedHotelIds(ids=>ids.includes(hotel.id)?ids.filter(id=>id!==hotel.id):[...ids,hotel.id]);}}>
                  {expandedHotelIds.includes(hotel.id)?t("collapse"):t("expand")}
                </Btn>
                <Btn th={th} v="sec" sz="sm" type="button" onClick={()=>void autofillHotel(hotel)} disabled={hotelSearchingId===hotel.id}>{hotelSearchingId===hotel.id?t("loading"):t("search")}</Btn>
                <Btn th={th} v="danger" sz="sm" type="button" onClick={()=>removeHotel(hotel.id)}>{t("remove")}</Btn>
              </div>
            </summary>
            <div className="mt-4 grid sm:grid-cols-2 gap-3">
              <Input th={th} label={t("hotelName")} value={hotel.hotelName} onChange={e=>updateHotel(hotel.id,{hotelName:e.target.value})}/>
              <Input th={th} label={t("roomType")} value={hotel.roomType} onChange={e=>updateHotel(hotel.id,{roomType:e.target.value})}/>
              <Input th={th} label={t("checkIn")} type="date" value={hotel.checkIn} onChange={e=>updateHotel(hotel.id,{checkIn:e.target.value})}/>
              <Input th={th} label={t("checkOut")} type="date" value={hotel.checkOut} onChange={e=>updateHotel(hotel.id,{checkOut:e.target.value})}/>
              <Input th={th} label={t("confirmationCode")} value={hotel.confirmationCode} onChange={e=>updateHotel(hotel.id,{confirmationCode:e.target.value})}/>
              <Input th={th} label={t("propertyContact")} value={hotel.contact} onChange={e=>updateHotel(hotel.id,{contact:e.target.value})}/>
            </div>
            <Textarea th={th} label={t("hotelAddress")} value={hotel.hotelAddress} onChange={e=>updateHotel(hotel.id,{hotelAddress:e.target.value})}/>
            <Textarea th={th} label={t("stayNotes")} value={hotel.notes} onChange={e=>updateHotel(hotel.id,{notes:e.target.value})}/>
          </details>)}
        </div>
      </Card>}

      <div className="grid lg:grid-cols-2 gap-4 sm:gap-6">
        {(!isMobileScreen||mobileDetailSection==="weather")&&<Card th={th} className="p-5 sm:p-6 space-y-4">
          <h3 className="text-xl font-semibold">{t("weatherLocationSettings")}</h3>
          <p className={cx("text-xs",th==="dark"?"text-slate-400":"text-slate-500")}>{t("weatherRangeHint")}</p>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
            <Input th={th} label={t("locationName")} value={weatherQuery} onChange={e=>setWeatherQuery(e.target.value)} placeholder="City, country" className="w-full"/>
            <Btn th={th} v="sec" type="button" className="h-[42px] whitespace-nowrap sm:px-5" onClick={()=>void searchWeatherLocations()} disabled={weatherSearching}>{weatherSearching?t("loading"):t("searchLocation")}</Btn>
          </div>
          {weatherSearchResults.length>0&&<Select th={th} label={t("matchingLocations")} value={selectedWeatherResult} onChange={e=>setSelectedWeatherResult(e.target.value)}>
            <option value="">Select location</option>
            {weatherSearchResults.map(item=>{
              const key=`${item.name}-${item.lat}-${item.lon}`;
              return <option key={key} value={key}>{item.name}{item.subtitle ? ` — ${item.subtitle}` : ""}</option>;
            })}
          </Select>}
          <div className="grid grid-cols-2 gap-3">
            <Input th={th} label={t("startDay")} type="number" min={1} max={form.duration} value={weatherStartDay} onChange={e=>setWeatherStartDay(+e.target.value)}/>
            <Input th={th} label={t("endDay")} type="number" min={1} max={form.duration} value={weatherEndDay} onChange={e=>setWeatherEndDay(+e.target.value)}/>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Btn th={th} v="sec" type="button" onClick={addWeatherLocationPlan} disabled={!selectedWeatherResult}>+ {t("addRange")}</Btn>
            <Btn th={th} v="sec" type="button" onClick={()=>setForm(f=>({...f,customLocation:undefined}))}>{t("useDestination")}</Btn>
            <Btn th={th} v="ghost" type="button" onClick={()=>setForm(f=>({...f,weatherLocations:undefined,customLocation:undefined}))}>{t("remove")}</Btn>
          </div>
          {(form.weatherLocations ?? []).length>0&&<div className="space-y-2">
            {(form.weatherLocations ?? []).map(item=><div key={item.id} className={cx("flex items-center justify-between rounded-2xl px-3 py-2",th==="dark"?"bg-white/[0.04]":"bg-slate-100")}>
              <p className="text-sm">{item.label} · Day {item.startDay}-{item.endDay}</p>
              <Btn th={th} v="danger" sz="sm" type="button" onClick={()=>removeWeatherLocationPlan(item.id)}>{t("remove")}</Btn>
            </div>)}
          </div>}
        </Card>}
      </div>
    </div>

    {(!isMobileScreen||mobileDetailSection==="banner")&&<div>
      <label className="block mb-2">{t("bannerColor")}</label>
      <input type="color" value={form.bannerColor} onChange={e=>setForm(f=>({...f,bannerColor:e.target.value}))}
        className={cx("w-full h-12 rounded-2xl border cursor-pointer",th==="dark"?"border-white/10":"border-slate-300")}/>
    </div>}

    {(!isMobileScreen||mobileDetailSection==="banner")&&<div>
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
        {bannerMessage&&<p className={cx("text-sm",th==="dark"?"text-cyan-300":"text-blue-700")}>{bannerMessage}</p>}
        <div className="flex flex-col sm:flex-row gap-2">
          <Input th={th} value={form.bannerImageUrl} onChange={e=>setForm(f=>({...f,bannerImageUrl:e.target.value}))} placeholder={t("bannerUrl")} className="flex-1"/>
          <Btn th={th} v="sec" onClick={setBannerUrl}>{t("add")}</Btn>
        </div>
      </div>
    </div>}

    <div className="flex flex-wrap gap-2 items-center">
      <Btn th={th} onClick={save} className="!bg-emerald-500 !text-white hover:!bg-emerald-400 !shadow-lg shadow-emerald-500/30">💾 {t("save")}</Btn>
      {saved&&<span className="text-emerald-400 font-medium">✓ {t("saved")}</span>}
      {hasUnsavedChanges&&<span className={cx("font-medium",th==="dark"?"text-amber-300":"text-amber-700")}>⚠️ {t("rememberSaveEdits")}</span>}
    </div>
    {isOwner&&<div className={cx("rounded-2xl border p-4",th==="dark"?"border-rose-400/30 bg-rose-400/10":"border-rose-200 bg-rose-50")}>
      <p className={cx("mb-3 text-sm",th==="dark"?"text-rose-100":"text-rose-700")}>{t("ownerDeleteTripNote")}</p>
      <Btn th={th} v="danger" type="button" onClick={removeTrip}>🗑️ {t("deleteTrip")}</Btn>
    </div>}
  </Card>;
}

/* ═══════════════════════════════════════════════════════════════════════════════
   ADMIN
   ═══════════════════════════════════════════════════════════════════════════════ */
function AdminWorkspace({profiles,trips,th,t,adminPw,adminAuth,setAdminPw,setAdminAuth,siteCfg,setSiteCfg,onDeleteTrip,onDeleteTraveler,onRefreshSync,onOpenPreviewWindow}:{
  profiles:Profile[];trips:Trip[];th:ThemeMode;t:(k:TKey)=>string;
  adminPw:string;adminAuth:boolean;setAdminPw:(v:string)=>void;setAdminAuth:(v:boolean)=>void;
  siteCfg:SiteSettings;setSiteCfg:(v:SiteSettings)=>void;
  onDeleteTrip:(id:string)=>void;onDeleteTraveler:(id:string)=>void;
  onRefreshSync?:()=>Promise<void>|void;
  onOpenPreviewWindow:(tripId:string)=>void;
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

    {tab==="trips"&&<AdminTrips trips={trips} profiles={profiles} siteCfg={siteCfg} th={th} t={t} onDelete={onDeleteTrip} onOpenPreviewWindow={onOpenPreviewWindow}/>}
    {tab==="travelers"&&<AdminTravelers profiles={profiles} trips={trips} th={th} t={t} onDelete={onDeleteTraveler}/>}
    {tab==="luggage"&&<AdminLuggageCfg th={th} t={t} settings={siteCfg} onSave={setSiteCfg}/>}
    {tab==="website"&&<div className="space-y-6">
      <AdminWebsite th={th} t={t} settings={siteCfg} onSave={setSiteCfg}/>
      <AdminCloudSyncConfig th={th} onSaved={onRefreshSync}/>
    </div>}
    {tab==="password"&&<AdminPasswordForm th={th} t={t} onSave={setAdminPw}/>}
  </div>;
}

function AdminTrips({trips,profiles,siteCfg,th,t,onDelete,onOpenPreviewWindow}:{trips:Trip[];profiles:Profile[];siteCfg:SiteSettings;th:ThemeMode;t:(k:TKey)=>string;onDelete:(id:string)=>void;onOpenPreviewWindow:(tripId:string)=>void;}){
  const [previewTrip,setPreviewTrip]=useState<Trip|null>(null);
  const confirmDeleteTrip=(trip:Trip)=>{
    const firstOk = window.confirm(`Delete trip "${trip.title}"? This cannot be undone.`);
    if(!firstOk) return;
    const secondOk = window.confirm(`Please reconfirm deleting "${trip.title}".`);
    if(!secondOk) return;
    onDelete(trip.id);
  };
  const previewUser = useMemo<Profile>(()=>({
    id:"admin-preview-viewer",
    accountName:"ADMINP0000",
    firstName:"Admin",
    lastName:"Preview",
    email:"preview@local",
    phone:"",
    password:"",
  }),[]);
  return <div className="space-y-3">
    <p className={cx(th==="dark"?"text-slate-400":"text-slate-500")}>{trips.length} {t("adminTrips")}</p>
    {trips.length===0?<Empty icon="✈️" title={t("noTrips")} desc="" th={th}/>
    :trips.map(tr=><Card key={tr.id} th={th} className="p-4 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-semibold text-lg">{tr.title}</p>
          <p className={cx("text-sm",th==="dark"?"text-slate-400":"text-slate-500")}>
            {tr.location} · {fmtDate(tr.startDate)} – {fmtDate(tr.endDate)} · {tr.members.length} {t("members")}
          </p>
          <p className={cx("text-sm mt-0.5",th==="dark"?"text-slate-500":"text-slate-400")}>ID: {tr.id} · {t("owner")}: {tr.ownerName}</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Btn th={th} v="sec" sz="sm" className="w-full sm:w-auto" onClick={()=>setPreviewTrip(tr)}>{t("overview")}</Btn>
          <Btn th={th} v="ghost" sz="sm" className="w-full sm:w-auto" onClick={()=>onOpenPreviewWindow(tr.id)}>Open Full Screen</Btn>
          <Btn th={th} v="danger" sz="sm" className="w-full sm:w-auto" onClick={()=>confirmDeleteTrip(tr)}>{t("delete")}</Btn>
        </div>
      </div>
    </Card>)}
    <Modal open={Boolean(previewTrip)} onClose={()=>setPreviewTrip(null)} th={th} title={previewTrip?.title} size="full" mobileFullscreen>
      <div className="mobile-compact-preview">
        {previewTrip&&<TripDetail
          trip={previewTrip}
          user={previewUser}
          profiles={profiles}
          siteCfg={siteCfg}
          th={th}
          t={t}
          onBack={()=>setPreviewTrip(null)}
          onUpdate={()=>{}}
          onDeleteTrip={()=>{}}
          onAddExp={()=>{}}
          onUpdateExp={()=>{}}
          onAddPack={()=>{}}
          onTogglePack={()=>{}}
          onRemovePack={()=>{}}
          onAddSharedPack={()=>{}}
          onRemoveSharedPack={()=>{}}
          onUpdateItin={()=>{}}
          onRemoveExp={()=>{}}
          onLeaveTrip={()=>{}}
          readOnly
        />}
      </div>
    </Modal>
  </div>;
}

function AdminTravelers({profiles,trips,th,t,onDelete}:{profiles:Profile[];trips:Trip[];th:ThemeMode;t:(k:TKey)=>string;onDelete:(id:string)=>void}){
  const confirmDeleteTraveler=(profile:Profile)=>{
    const firstOk = window.confirm(`Delete user "${dn(profile)}" (@${profile.accountName})?`);
    if(!firstOk) return;
    const secondOk = window.confirm(`Please reconfirm deleting "${dn(profile)}".`);
    if(!secondOk) return;
    onDelete(profile.id);
  };
  return <div className="space-y-3">
    <p className={cx(th==="dark"?"text-slate-400":"text-slate-500")}>{profiles.length} {t("adminTravelers")}</p>
    {profiles.length===0?<Empty icon="👥" title={t("noData")} desc="" th={th}/>
    :profiles.map(p=>{
      const joined=trips.filter(tr=>tr.members.includes(p.id)).length;
      return <Card key={p.id} th={th} className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-3">
            <Avatar name={dn(p)} icon={p.icon} iconImage={p.iconImage} th={th}/>
            <div>
              <p className="font-semibold text-lg">{dn(p)}</p>
              <p className={cx("text-sm",th==="dark"?"text-slate-400":"text-slate-500")}>@{p.accountName} · {p.email} · {p.phone}</p>
              <p className={cx("text-sm",th==="dark"?"text-amber-300":"text-amber-700")}>Password: {p.password || "—"}</p>
              <p className={cx("text-sm",th==="dark"?"text-slate-500":"text-slate-400")}>{joined} {t("adminTrips")}</p>
            </div>
          </div>
          <Btn th={th} v="danger" sz="sm" onClick={()=>confirmDeleteTraveler(p)}>{t("remove")}</Btn>
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
  const [form,setForm]=useState<SiteSettings>(normSite(settings));
  const [saved,setSaved]=useState(false);
  const [hasUnsavedChanges,setHasUnsavedChanges]=useState(false);
  useEffect(()=>{ setForm(normSite(settings)); setHasUnsavedChanges(false); },[settings]);
  useEffect(()=>{
    const normalizedSettings = normSite(settings);
    setHasUnsavedChanges(JSON.stringify(form)!==JSON.stringify(normalizedSettings));
  },[form,settings]);
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
      {hasUnsavedChanges&&<span className={cx("font-medium",th==="dark"?"text-amber-300":"text-amber-700")}>⚠️ Remember to save your edits.</span>}
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
      if(workerEndpoint.trim()){
        await verifyCloudWorkerEndpoint(workerEndpoint);
        setMsg("✅ Worker endpoint reachable. Sync is active; D1 credentials are optional and only used for direct fallback.");
      }else if(nextConfig.accountId && nextConfig.databaseId && nextConfig.apiToken){
        await verifyCloudD1Config(nextConfig);
        setMsg("✅ Direct Cloudflare D1 API credentials verified. Use this mode only when Worker endpoint is not configured.");
      }else{
        throw new Error("Enter a Worker endpoint, or provide Account ID + D1 Database ID + API Token for direct D1 fallback.");
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
    setD1Testing(true);
    setErr("");
    setMsg("");
    try{
      const endpoint = workerEndpoint.trim();
      if(endpoint){
        const testKey = `tp-d1-self-test-${Date.now()}`;
        const setResp = await fetch(endpoint,{
          method:"POST",
          headers:{"content-type":"application/json"},
          body:JSON.stringify({ id:crypto.randomUUID(), action:"set", key:testKey, value:{ ok:true, t:Date.now() } }),
        });
        const setPayload = await setResp.json();
        if(!setResp.ok || setPayload?.ok !== true){
          throw new Error(setPayload?.error ?? `Worker D1 set test failed (${setResp.status})`);
        }

        const getResp = await fetch(endpoint,{
          method:"POST",
          headers:{"content-type":"application/json"},
          body:JSON.stringify({ id:crypto.randomUUID(), action:"get", key:testKey }),
        });
        const getPayload = await getResp.json();
        const data = getPayload?.data;
        if(!getResp.ok || getPayload?.ok !== true || data?.exists !== true){
          throw new Error(getPayload?.error ?? `Worker D1 get test failed (${getResp.status})`);
        }
        setMsg("✅ D1 schema/storage test passed via Worker endpoint (set/get succeeded).");
      }else{
        const nextConfig: CloudD1Config = {
          accountId: accountId.trim(),
          databaseId: databaseId.trim(),
          apiToken: apiToken.trim(),
        };
        if(!nextConfig.accountId || !nextConfig.databaseId || !nextConfig.apiToken){
          throw new Error("Enter Worker endpoint, or provide Account ID + D1 Database ID + API Token for direct D1 test.");
        }
        await verifyCloudD1Config(nextConfig);
        setMsg("✅ Direct D1 schema test passed (CREATE TABLE/INDEX + SELECT 1).");
      }
    }catch(error){
      setErr(error instanceof Error ? error.message : "D1 schema test failed.");
    }finally{
      setD1Testing(false);
    }
  };

  const resetWorkerEndpointToDefault = ()=>{
    setCloudWorkerEndpoint("");
    setWorkerEndpoint(DEPLOYED_CLOUDFLARE_WORKER_ENDPOINT);
    setMsg("Using deployed default worker endpoint on this device.");
    setErr("");
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
      <Btn th={th} type="button" v="sec" onClick={resetWorkerEndpointToDefault} disabled={busy || testing || d1Testing}>Use Deployed Endpoint</Btn>
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
  const [adminAuth,setAdminAuth]=useState(false);
  const [userId,setUserId]=usePersist<string>(SK.userId,"");
  const [siteCfg,setSiteCfg,siteCfgMeta]=useSharedPersist<SiteSettings>(SK.site,defaultSiteSettings);
  const [view,setView]=useState<ViewMode>("user");
  const [authMode,setAuthMode]=useState<"signin"|"signup">("signin");
  const [showAuth,setShowAuth]=useState(false);
  const [manualSyncing,setManualSyncing]=useState(false);
  const adminPreviewTripId = useMemo(()=>{
    if(typeof window==="undefined") return "";
    return (new URLSearchParams(window.location.search).get("adminPreviewTrip") ?? "").trim().toUpperCase();
  },[]);

  const t=useT(lang);

  useEffect(()=>{setProfiles(c=>c.map(normProfile));setTrips(c=>c.map(normTrip));setSiteCfg(c=>normSite(c));},[]);
  useEffect(()=>{
    if(!tripsMeta.hydrated || !siteCfgMeta.hydrated) return;
    setTrips(currentTrips=>{
      let changed = false;
      const nextTrips = currentTrips.map(trip=>{
        const synced = syncTripPackingWithCurrentTemplate(trip, siteCfg);
        if(synced !== trip) changed = true;
        return synced;
      });
      return changed ? nextTrips : currentTrips;
    });
  },[setTrips,siteCfg,siteCfgMeta.hydrated,tripsMeta.hydrated]);
  useEffect(()=>{document.documentElement.dataset.theme=theme;},[theme]);

  const sharedSyncReady = profilesMeta.hydrated && tripsMeta.hydrated && adminPwMeta.hydrated && siteCfgMeta.hydrated;
  const sharedSyncErrors = [profilesMeta.lastError,tripsMeta.lastError,adminPwMeta.lastError,siteCfgMeta.lastError].filter(Boolean);
  const syncStatusMessage = sharedSyncErrors[0] ?? "";
  const sharedSyncHealthy = sharedSyncReady && sharedSyncErrors.length===0;
  const refreshSharedSync = useCallback(async()=>{
    setManualSyncing(true);
    try{
      await Promise.allSettled([profilesMeta.syncNow(),tripsMeta.syncNow(),adminPwMeta.syncNow(),siteCfgMeta.syncNow()]);
    }finally{
      setManualSyncing(false);
    }
  },[adminPwMeta,profilesMeta,siteCfgMeta,tripsMeta]);

  const user=useMemo(()=>profiles.find(p=>p.id===userId),[userId,profiles]);
  const previewTrip = useMemo(()=>trips.find(tr=>tr.id===adminPreviewTripId)||null,[trips,adminPreviewTripId]);
  const isAdminPreviewMode = Boolean(adminPreviewTripId);
  const previewUser = useMemo<Profile>(()=>({
    id:"admin-preview-viewer",
    accountName:"ADMINP0000",
    firstName:"Admin",
    lastName:"Preview",
    email:"preview@local",
    phone:"",
    password:"",
  }),[]);
  const openAdminPreviewWindow=(tripId:string)=>{
    const nextUrl=new URL(window.location.href);
    nextUrl.searchParams.set("adminPreviewTrip",tripId);
    window.open(nextUrl.toString(),"_blank","noopener,noreferrer");
  };

  const handleSignIn=(ident:string,pw:string)=>{
    if(!sharedSyncReady)return{ok:false,message:"Shared account data is still syncing. Please wait a moment and try again."};
    if(!sharedSyncHealthy)return{ok:false,message:`Cloud sync has an error on this device: ${syncStatusMessage}`};
    const found=profiles.find(p=>(p.email.toLowerCase()===ident.trim().toLowerCase()||p.accountName.toLowerCase()===ident.trim().toLowerCase())&&p.password===pw);
    if(!found)return{ok:false,message:t("invalidCredentials")};
    setUserId(found.id);return{ok:true,message:"OK"};
  };

  const handleSignUp=(d:Omit<Profile,"id">)=>{
    if(!sharedSyncHealthy)return{ok:false,message:`Cannot create a shared account until cloud sync is healthy on this device: ${syncStatusMessage}`};
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
    const packing = buildTemplatePackingList(siteCfg, user.id);
    const trip:Trip={
      id:tripCode(),ownerId:user.id,ownerName:dn(user),
      title:d.title,location:d.location,startDate:d.startDate,endDate:d.endDate,duration:dur,
      flightNumber:"",airline:"",departureAirport:"",arrivalAirport:"",departureTime:"",arrivalTime:"",terminal:"",bookingReference:"",
      hotelName:"",hotelAddress:"",roomType:"",checkIn:"",checkOut:"",confirmationCode:"",transportMode:"Transit",notes:"",travelNotes:[],
      flightLegs:[],hotels:[],
      bannerColor:"#2563eb",bannerImage:"",memberRoles:{[user.id]:"owner"},members:[user.id],expenses:[],
      itineraryChecklists:{[user.id]:{}},packingList:packing,
      itinerary:[],optionalStops:[],freeTimeEntries:[],createdAt:new Date().toISOString(),
      luggageTemplateVersion: luggageTemplateVersion(siteCfg),
      luggageCustomized: false,
    };
    setTrips(c=>[trip,...c]);
  };

  const joinTrip=(code:string)=>{
    if(!user)return{ok:false,message:"Not signed in."};
    const trip=trips.find(t=>t.id===code);
    if(!trip)return{ok:false,message:"Trip not found."};
    if(trip.members.includes(user.id))return{ok:false,message:"Already joined."};
    setTrips(c=>c.map(t=>t.id===code?{
      ...t,
      members:[...t.members,user.id],
      memberRoles:{...(t.memberRoles ?? {}),[user.id]:"viewer"},
      itineraryChecklists:{...(t.itineraryChecklists ?? {}),[user.id]:{}},
    }:t));
    return{ok:true,message:`Joined "${trip.title}"!`};
  };

  const updateTrip=(id:string,d:Partial<Trip>)=>setTrips(c=>c.map(t=>t.id===id?{...t,...d}:t));
  const addExpense=(tid:string,e:Omit<Expense,"id">)=>setTrips(c=>c.map(t=>t.id===tid?{...t,expenses:[{...e,id:uid("ex")},...t.expenses]}:t));
  const updateExpense=(tid:string,eid:string,e:Omit<Expense,"id">)=>setTrips(c=>c.map(t=>t.id===tid?{...t,expenses:t.expenses.map(exp=>exp.id===eid?{...exp,...e}:exp)}:t));
  const removeExpense=(tid:string,eid:string)=>setTrips(c=>c.map(t=>t.id===tid?{...t,expenses:t.expenses.filter(e=>e.id!==eid)}:t));
  const addPack=(tid:string,l:string,cat:string)=>{
    if(!user)return;
    setTrips(c=>c.map(t=>t.id===tid?{...t,luggageCustomized:true,packingList:[...t.packingList,{id:uid("pk"),label:l,category:cat,assignedTo:dn(user),packedBy:{[user.id]:false},createdById:user.id,isTemplateDefault:false}]}:t));
  };
  const togglePack=(tid:string,iid:string)=>{
    if(!user) return;
    setTrips(c=>c.map(t=>t.id===tid?{...t,packingList:t.packingList.map(i=>i.id===iid?{...i,packedBy:{...(i.packedBy ?? {}),[user.id]:!(i.packedBy?.[user.id] ?? i.packedBy?.legacy ?? i.packed)}}:i)}:t));
  };
  const removePack=(tid:string,iid:string)=>setTrips(c=>c.map(t=>t.id===tid?{...t,luggageCustomized:true,packingList:t.packingList.filter(i=>i.id!==iid)}:t));
  const addSharedPack=(tid:string,l:string,cat:string)=>{
    if(!user)return;
    setTrips(c=>c.map(t=>t.id===tid&&t.ownerId===user.id?{...t,luggageCustomized:true,packingList:[...t.packingList,{id:uid("pk"),label:l,category:cat,assignedTo:TEMPLATE_LUGGAGE_ASSIGNED_TO,packedBy:{},isSharedDefault:true,isTemplateDefault:false,createdById:user.id}]}:t));
  };
  const removeSharedPack=(tid:string,iid:string)=>{
    if(!user)return;
    setTrips(c=>c.map(t=>t.id===tid&&t.ownerId===user.id?{...t,luggageCustomized:true,packingList:t.packingList.filter(i=>!(i.id===iid&&i.isSharedDefault))}:t));
  };
  const updateItin=(tid:string,items:ItineraryItem[])=>setTrips(c=>c.map(t=>t.id===tid?{...t,itinerary:items}:t));
  const leaveTrip=(tripId:string)=>{
    if(!user) return;
    setTrips(c=>c.map(t=>{
      if(t.id!==tripId || t.ownerId===user.id) return t;
      const nextRoles={...(t.memberRoles ?? {})};
      delete nextRoles[user.id];
      const nextChecklists={...(t.itineraryChecklists ?? {})};
      delete nextChecklists[user.id];
      return {
        ...t,
        members:t.members.filter(memberId=>memberId!==user.id),
        memberRoles:nextRoles,
        itineraryChecklists:nextChecklists,
        expenses:t.expenses
          .filter(exp=>exp.paidBy!==user.id)
          .map(exp=>({
            ...exp,
            participants:exp.participants.filter(pid=>pid!==user.id),
            customSplits:Object.fromEntries(Object.entries(exp.customSplits ?? {}).filter(([pid])=>pid!==user.id)),
          })),
      };
    }));
  };
  const deleteTrip=(id:string)=>setTrips(c=>c.filter(t=>t.id!==id));
  const deleteTraveler=(id:string)=>{
    setProfiles(c=>c.filter(p=>p.id!==id));
    setTrips(c=>c.map(t=>{
      const nextRoles={...(t.memberRoles ?? {})};
      delete nextRoles[id];
      const nextChecklists={...(t.itineraryChecklists ?? {})};
      delete nextChecklists[id];
      return {...t,ownerId:t.ownerId===id?"":t.ownerId,ownerName:t.ownerId===id?"Removed":t.ownerName,members:t.members.filter(m=>m!==id),
        memberRoles:nextRoles,itineraryChecklists:nextChecklists,
        expenses:t.expenses.filter(e=>e.paidBy!==id).map(e=>({...e,participants:e.participants.filter(p=>p!==id)}))};
    }));
    if(userId===id)setUserId("");
  };

  const bg=theme==="dark"?"bg-slate-950 text-white":"bg-[#cdd0d8] text-slate-900";
  const showLanding=!user&&view==="user";

  if(isAdminPreviewMode){
    return <div className={cx("min-h-screen transition-colors duration-300",bg)}>
      <div className="mobile-compact-preview max-w-7xl mx-auto px-4 py-5 sm:px-6 sm:py-8 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold sm:text-2xl">Admin Trip Full-Screen Preview</h1>
          <div className="flex gap-2">
            <Btn th={theme} v="ghost" sz="sm" onClick={()=>window.close()}>Close Window</Btn>
          </div>
        </div>
        {!sharedSyncReady?<Card th={theme} className="p-6">Loading trip preview…</Card>
        :!previewTrip?<Card th={theme} className="p-6">Trip not found. This trip may have been removed.</Card>
        :<TripDetail
          trip={previewTrip}
          user={previewUser}
          profiles={profiles}
          siteCfg={siteCfg}
          th={theme}
          t={t}
          onBack={()=>window.close()}
          onUpdate={()=>{}}
          onDeleteTrip={()=>{}}
          onAddExp={()=>{}}
          onUpdateExp={()=>{}}
          onAddPack={()=>{}}
          onTogglePack={()=>{}}
          onRemovePack={()=>{}}
          onAddSharedPack={()=>{}}
          onRemoveSharedPack={()=>{}}
          onUpdateItin={()=>{}}
          onRemoveExp={()=>{}}
          onLeaveTrip={()=>{}}
          readOnly
        />}
      </div>
    </div>;
  }

  return <div className={cx("min-h-screen transition-colors duration-300",bg)}>
    {showLanding&&<>
      <div className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4">
        <span className="font-bold text-white text-2xl drop-shadow">✈ {siteCfg.siteName}</span>
        <div className="flex gap-2 items-center">
          <label className="flex items-center gap-2 rounded-full px-3 py-2 text-sm bg-white/15 text-white border border-white/20">
            <span>🌐</span>
            <select value={lang} onChange={e=>setLang(e.target.value as Language)} className="bg-transparent outline-none pr-3">
              <option value="en" className="text-black">{t("english")}</option>
              <option value="zh" className="text-black">{t("chinese")}</option>
            </select>
          </label>
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
            onRefreshSync={refreshSharedSync} onOpenPreviewWindow={openAdminPreviewWindow}/>
    )}

    {view==="user"&&user&&<UserWorkspace user={user} trips={trips} profiles={profiles} siteCfg={siteCfg} th={theme} t={t}
      onUpdate={d=>setProfiles(c=>c.map(p=>p.id===user.id?{...p,...d,
        accountName: d.accountName!==undefined ? upper(d.accountName) : p.accountName,
        firstName: d.firstName!==undefined ? normalizeName(d.firstName) : p.firstName,
        lastName: d.lastName!==undefined ? normalizeName(d.lastName) : p.lastName,
        phone: d.phone!==undefined ? d.phone.replace(/\D/g,"").slice(0,8) : p.phone,
        homeAirport: d.homeAirport!==undefined ? (normalizeAirport(d.homeAirport)||"HKG") : p.homeAirport,
      }:p))}
      onCreate={createTrip} onJoin={joinTrip} onLeaveTrip={leaveTrip} onTripUpdate={updateTrip}
      onDeleteTrip={deleteTrip}
      onAddExp={addExpense} onUpdateExp={updateExpense} onAddPack={addPack} onTogglePack={togglePack} onRemovePack={removePack}
      onAddSharedPack={addSharedPack} onRemoveSharedPack={removeSharedPack}
      onUpdateItin={updateItin} onRemoveExp={removeExpense}/>}

    <AuthModal open={showAuth} mode={authMode} th={theme} t={t} onClose={()=>setShowAuth(false)}
      onSignIn={handleSignIn} onSignUp={handleSignUp} onToggle={()=>setAuthMode(m=>m==="signin"?"signup":"signin")}/>
  </div>;
}

const rootEl = document.getElementById("root");

if (rootEl) {
  createRoot(rootEl).render(<App />);
}
