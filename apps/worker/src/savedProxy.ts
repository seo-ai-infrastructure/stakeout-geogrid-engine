import type { ProxyCheck } from "./duoplus.js";
import type { GeoTarget } from "./proxySeller.js";

const normalize = (value?: string) => (value ?? "").toLowerCase().replace(/[^a-z]/g, "");
// Provider region names are state names rather than ISO subdivision codes.
const states: Record<string, string> = {
  AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",CO:"Colorado",CT:"Connecticut",DE:"Delaware",
  FL:"Florida",GA:"Georgia",HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",IA:"Iowa",KS:"Kansas",KY:"Kentucky",
  LA:"Louisiana",ME:"Maine",MD:"Maryland",MA:"Massachusetts",MI:"Michigan",MN:"Minnesota",MS:"Mississippi",
  MO:"Missouri",MT:"Montana",NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",NJ:"New Jersey",NM:"New Mexico",
  NY:"New York",NC:"North Carolina",ND:"North Dakota",OH:"Ohio",OK:"Oklahoma",OR:"Oregon",PA:"Pennsylvania",
  RI:"Rhode Island",SC:"South Carolina",SD:"South Dakota",TN:"Tennessee",TX:"Texas",UT:"Utah",VT:"Vermont",
  VA:"Virginia",WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming",DC:"District of Columbia",
};

/** Saved credentials are never read or overwritten. Check the actual exit for every pin. */
export async function validateSavedProxy(
  proxyId: string,
  target: GeoTarget,
  check: (id: string) => Promise<ProxyCheck>,
): Promise<ProxyCheck> {
  if (target.ispId) throw new Error("Saved proxy mode cannot verify a numeric ISP target; leave ISP blank or use dynamic mode");
  const result = await check(proxyId);
  if (!result.ok || !result.ip) throw new Error("Saved DuoPlus proxy connection check failed");
  if (!["us", "usa", "unitedstates"].includes(normalize(result.country))) {
    throw new Error("Saved proxy exit is not verified in the United States");
  }
  const region = normalize(result.region);
  const stateCode = target.stateCode.toUpperCase();
  if (!region || !states[stateCode] || ![normalize(stateCode), normalize(states[stateCode])].includes(region)) {
    throw new Error("Saved proxy exit does not match the scan state");
  }
  if (!normalize(target.city) || normalize(result.city) !== normalize(target.city)) {
    throw new Error("Saved proxy exit does not match the scan city; use a matching saved proxy or dynamic mode");
  }
  return result;
}
