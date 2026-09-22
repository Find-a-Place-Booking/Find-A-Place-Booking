import { getPublicHostProfileForProperty } from "@/lib/hosts/public-profile";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "H";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export async function PublicHostCard({
  propertyId,
  fallbackHostName,
}: {
  propertyId: string;
  fallbackHostName: string;
}) {
  const host = await getPublicHostProfileForProperty(propertyId);
  const name = host?.name || fallbackHostName || "Find A Place host";
  const description =
    host?.publicBio ||
    `${name} independently manages this stay. Booking questions, property details and guest communication are handled directly by the host through Find A Place.`;

  return (
    <div className="host-block">
      <div className="host-avatar">
        {host?.avatarUrl ? (
          <img
            src={host.avatarUrl}
            alt={`${name} host profile`}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              borderRadius: "999px",
            }}
          />
        ) : (
          initials(name)
        )}
      </div>

      <div>
        <small>Hosted by</small>
        <h3>{name}</h3>
        <p>
          Independent host · Listed on Find A Place
          {host?.businessLocation ? ` · ${host.businessLocation}` : ""}
        </p>
        <p className="muted">{description}</p>
      </div>
    </div>
  );
}
