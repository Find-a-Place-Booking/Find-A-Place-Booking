export type SuggestedPropertyTaxLine = {
  category: "LOCAL_SALES" | "LOCAL_LODGING" | "OTHER";
  label: string;
  baseScope: "LODGING_ONLY" | "ACCOMMODATION_TOTAL" | "PRE_TAX_TOTAL";
};

export type StateTaxSetupConfig = {
  code: string;
  name: string;
  intro: string;
  localHelp: string;
  suggestedLines: SuggestedPropertyTaxLine[];
  reviewNote?: string;
};

const CONFIGS: Record<string, StateTaxSetupConfig> = {
  AR: {
    code: "AR",
    name: "Arkansas",
    intro:
      "Arkansas state sales tax and Arkansas tourism tax are added automatically from the active statewide rules.",
    localHelp:
      "Add only the city/county sales tax and any local lodging, tourism, hotel or A&P tax that applies at this property address.",
    suggestedLines: [
      {
        category: "LOCAL_SALES",
        label: "City + county sales tax",
        baseScope: "ACCOMMODATION_TOTAL",
      },
      {
        category: "LOCAL_LODGING",
        label: "Local lodging / A&P tax",
        baseScope: "ACCOMMODATION_TOTAL",
      },
    ],
  },
  MO: {
    code: "MO",
    name: "Missouri",
    intro:
      "Missouri's statewide lodging sales-tax rule is added automatically for Missouri properties.",
    localHelp:
      "Add local sales, district, tourism, convention or lodging taxes that apply to this property's location.",
    suggestedLines: [
      {
        category: "LOCAL_SALES",
        label: "Local sales / district tax",
        baseScope: "ACCOMMODATION_TOTAL",
      },
      {
        category: "LOCAL_LODGING",
        label: "Local tourism / lodging tax",
        baseScope: "ACCOMMODATION_TOTAL",
      },
    ],
  },
  TX: {
    code: "TX",
    name: "Texas",
    intro:
      "Texas state hotel occupancy tax is added automatically for Texas properties.",
    localHelp:
      "Add city, county, special-district or venue hotel-occupancy taxes that apply to this property.",
    suggestedLines: [
      {
        category: "LOCAL_LODGING",
        label: "City hotel occupancy tax",
        baseScope: "LODGING_ONLY",
      },
      {
        category: "LOCAL_LODGING",
        label: "County / district hotel occupancy tax",
        baseScope: "LODGING_ONLY",
      },
    ],
  },
  TN: {
    code: "TN",
    name: "Tennessee",
    intro:
      "Tennessee state sales tax is added automatically for Tennessee short-term lodging.",
    localHelp:
      "Add the local sales-tax and local occupancy-tax rates that apply to this property.",
    suggestedLines: [
      {
        category: "LOCAL_SALES",
        label: "Local sales tax",
        baseScope: "PRE_TAX_TOTAL",
      },
      {
        category: "LOCAL_LODGING",
        label: "Local occupancy tax",
        baseScope: "PRE_TAX_TOTAL",
      },
    ],
    reviewNote:
      "Tennessee has marketplace-specific local occupancy-tax rules. Confirm the filing/remittance setup before activating Tennessee bookings.",
  },
};

export function getStateTaxSetup(code: string | null | undefined): StateTaxSetupConfig {
  const normalized = (code || "").trim().toUpperCase();
  return (
    CONFIGS[normalized] ?? {
      code: normalized || "OTHER",
      name: normalized || "Other state",
      intro:
        "No statewide automatic lodging-tax rule is currently configured for this state.",
      localHelp:
        "Add every tax that should be charged to the guest for this property.",
      suggestedLines: [
        {
          category: "LOCAL_SALES",
          label: "Sales tax",
          baseScope: "ACCOMMODATION_TOTAL",
        },
        {
          category: "LOCAL_LODGING",
          label: "Lodging / occupancy tax",
          baseScope: "ACCOMMODATION_TOTAL",
        },
      ],
      reviewNote:
        "Have Find A Place review this state's setup before enabling live checkout.",
    }
  );
}

export function stateName(code: string | null | undefined) {
  return getStateTaxSetup(code).name;
}
