import { publicPreferenceSchema } from "@insta/contracts/privacy";
import { hydrate } from "svelte";
import Fixture from "./Fixture/index.svelte";

const initial = publicPreferenceSchema.parse(
  JSON.parse(
    document.querySelector("#public-preference")?.textContent ?? "null",
  ),
);
const target = document.getElementById("app");
if (!target) throw new Error("Missing standalone app");
hydrate(Fixture, { target, props: { initial } });
