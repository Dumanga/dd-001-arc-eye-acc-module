export type LoginRequestDTO = {
  identifier: string;
  password: string;
  portal?: "OPERATION" | "ACCOUNTING";
  rememberMe?: boolean | "on" | "true" | "false" | "1" | "0";
};

export type LoginResponseDTO = {
  userId: string;
  role:
    | "SUPER_ADMIN"
    | "CASHIER"
    | "REPAIR_STAFF"
    | "DATA_ENTRY"
    | "SUPERVISOR";
  displayName: string;
};

export type SessionDTO = {
  token: string;
  expiresAt: string;
};
