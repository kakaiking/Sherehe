import type { ReactElement } from "react";
import type { User } from "../App";
import { GuestShop } from "./shop/GuestShop";
import { VendorShop } from "./shop/VendorShop";

export function ShopPage({
  user,
  onAuth,
}: {
  user: User | null;
  onAuth?: (user: User) => void;
}): ReactElement {
  if (user?.role === "vendor") {
    return <VendorShop />;
  }
  return <GuestShop user={user} {...(onAuth ? { onAuth } : {})} />;
}
