import { useState, useEffect } from "react";
import type { SetupRecord } from "./types";
import { loadSetups, addSetup as addSetupToStorage, updateSetupOutcome as updateOutcomeInStorage } from "./storage";

export function useSetups() {
  const [setups, setSetups] = useState<SetupRecord[]>([]);

  useEffect(() => {
    setSetups(loadSetups());
  }, []);

  function addSetup(setup: SetupRecord) {
    setSetups(addSetupToStorage(setup));
  }

  function updateOutcome(id: string, outcome: SetupRecord["outcome"]) {
    setSetups(updateOutcomeInStorage(id, outcome));
  }

  return { setups, addSetup, updateOutcome };
}