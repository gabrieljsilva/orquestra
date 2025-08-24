import { Injectable } from "../ioc-container";
import { OrquestraMacro } from "./orquestra-macro";

export class MacroRegistry extends Injectable {
  private readonly titleToMacro = new Map<string, OrquestraMacro>();

  register(macro: OrquestraMacro): void {
    if (!macro?.title) {
      throw new Error("Macro must have a non-empty title");
    }
    this.titleToMacro.set(macro.title, macro);
  }

  get(title: string): OrquestraMacro | undefined {
    return this.titleToMacro.get(title);
  }

  clear(): void {
    this.titleToMacro.clear();
  }
}


