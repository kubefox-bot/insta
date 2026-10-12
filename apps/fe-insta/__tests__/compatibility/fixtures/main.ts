import { mount } from "svelte";
import Fixture from "./Fixture/index.svelte";

const target = document.getElementById("app");
if (!target) throw new Error("Fixture mount target is missing");
mount(Fixture, { target });
