import { useNavigate } from "react-router-dom";
import type { User } from "../App";
import { saveContinue } from "./continue";

/**
 * If the visitor is signed in, run `then`. Otherwise stash the in-app path
 * and send them to sign-in so they resume the same step afterward.
 */
export function useAuthGate(user: User | null): (
  resumePath: string,
  then: () => void,
) => void {
  const navigate = useNavigate();
  return (resumePath: string, then: () => void): void => {
    if (!user) {
      saveContinue(resumePath);
      void navigate("/login");
      return;
    }
    then();
  };
}
