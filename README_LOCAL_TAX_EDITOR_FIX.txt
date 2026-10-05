Find A Place Booking — Local Tax Editor UX Fix

FULL REPLACEMENT FILES
- components/taxes/PropertyTaxLineFields.tsx
- components/onboarding/OnboardingTaxSetup.tsx

NO DATABASE MIGRATION.
NO TAX CALCULATION ENGINE CHANGES.
NO STATEWIDE TAX RATES CHANGED.

What this fixes
- Makes it explicit that Arkansas statewide sales/tourism taxes shown above are automatic.
- Renames the button to "+ Add local tax".
- Makes local tax types unmistakable:
  Local sales tax
  Local lodging / occupancy / A&P
  Other local tax
- Makes the local percentage field easier to type/edit, including decimal rates.
  The previous controlled number field immediately reformatted every keystroke,
  which could make edits feel stuck or reset while typing.
- Blank suggested local rates now stay visually blank instead of forcing "0".
- Applies the same behavior in host onboarding and the later Payments & taxes editor.

Live data checked before creating this overlay
- Arkansas automatic rules are currently 6.5% state sales + 2% Arkansas tourism.
- Renea's Whitetail Cabin currently has a saved 3% custom/local line.
- That existing Whitetail line is labeled "City + county sales tax" but is currently
  categorized as LOCAL_LODGING. The amount still calculates from its saved base,
  but the category should be reviewed for clarity.
- Lil' Rustic currently has no custom/local tax line saved.

This overlay intentionally does NOT edit Renea's live tax records. It fixes the
editor so she can clearly add/correct the local 3% herself and certify the setup.
