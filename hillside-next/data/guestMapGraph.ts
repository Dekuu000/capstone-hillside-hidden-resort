export type GuestTrailEdge = {
  from: string;
  to: string;
};

export const guestTrailEdges: GuestTrailEdge[] = [
  { from: "lobby", to: "pool" },
  { from: "lobby", to: "cottages" },
  { from: "lobby", to: "hall" },
  { from: "pool", to: "spa" },
  { from: "pool", to: "garden" },
  { from: "garden", to: "tour" },
  { from: "tour", to: "viewdeck" },
  { from: "cottages", to: "garden" },
  { from: "cottages", to: "kiosk" },
  { from: "kiosk", to: "hall" },
  { from: "kiosk", to: "tour" },
];
