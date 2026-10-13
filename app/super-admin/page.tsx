import Home from "@/app/page";

const superAdminRoles = ["SUPER_ADMIN"] as const;

export default function SuperAdminPortal() {
  return (
    <Home
      allowedRoles={[...superAdminRoles]}
      portalName="Super Administrator"
      initialView="Dashboard"
    />
  );
}
