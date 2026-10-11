export type Role = "driver" | "owner";

export interface User {
  id: number;
  username: string;
  role: Role;
}

// Where each role lands after logging in.
export function homeFor(role: Role): string {
  return role === "owner" ? "/owner/spaces" : "/search";
}
