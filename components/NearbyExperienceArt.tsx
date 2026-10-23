/** Branded, low-bandwidth fallback for nearby places without host-supplied photos. */
export function NearbyExperienceArt({ category }: { category: string }) {
  const kind = category.toLowerCase();
  const isWater = /lake|river|water/.test(kind);
  const isOffroad = /atv|off-road|trail/.test(kind);
  const isFood = /food|drink|restaurant/.test(kind);
  const isShopping = /shopping|local/.test(kind);
  const isFamily = /family/.test(kind);
  const isEntertainment = /entertainment/.test(kind);
  const isAttraction = /attraction/.test(kind);

  const common = {
    fill: 'none' as const,
    stroke: 'currentColor',
    strokeWidth: 2.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  return (
    <svg viewBox="0 0 120 90" width="96" height="76" aria-hidden="true" focusable="false" {...common}>
      <circle cx="91" cy="25" r="9" strokeWidth="2" opacity="0.7" />
      {isWater ? (
        <>
          <path d="M10 59c10-6 18-6 28 0s18 6 28 0 18-6 28 0 18 6 20 4" />
          <path d="M10 70c10-6 18-6 28 0s18 6 28 0 18-6 28 0 18 6 20 4" opacity="0.7" />
          <path d="M23 45 44 18l23 30 13-15 17 20" opacity="0.75" />
        </>
      ) : isOffroad ? (
        <>
          <circle cx="30" cy="65" r="11" />
          <circle cx="90" cy="65" r="11" />
          <path d="M30 65 45 43h28l17 22M45 43l-7-10h-9M73 43l7-10h11M43 54h36M45 43l-10 22M68 54l8 11" />
        </>
      ) : isFood ? (
        <>
          <path d="M25 51c3 21 22 28 35 28s32-7 35-28H25Z" />
          <path d="M20 51h80M40 21v13M51 19v15M64 22v12" opacity="0.85" />
          <path d="M79 24c-10 5-11 16-6 24" />
        </>
      ) : isShopping ? (
        <>
          <path d="M27 36h66v42H27V36ZM22 36l8-21h60l8 21M27 36c0 12 14 13 17 0 2 12 15 13 17 0 2 12 15 13 17 0 3 13 17 12 20 0" />
          <path d="M42 53h21v25M73 52h12v13H73z" />
        </>
      ) : isFamily ? (
        <>
          <path d="M13 68h94M24 65l36-48 36 48" />
          <path d="M47 65V49h26v16" />
          <circle cx="60" cy="35" r="5" />
        </>
      ) : isEntertainment ? (
        <>
          <path d="M24 28 90 15l8 43-66 13-8-43Z" />
          <path d="m43 46 20-15 4 26" />
          <path d="M24 72 102 57" opacity="0.7" />
        </>
      ) : isAttraction ? (
        <>
          <path d="M60 78s29-29 29-47a29 29 0 1 0-58 0c0 18 29 47 29 47Z" />
          <circle cx="60" cy="31" r="11" />
        </>
      ) : (
        <>
          <path d="M6 70 39 23l25 34 15-20 35 33H6Z" />
          <path d="m30 70 11-12 10 12M17 65V43m-9 9 9-16 9 16M94 68V48m-10 9 10-17 10 17" opacity="0.75" />
        </>
      )}
    </svg>
  );
}
