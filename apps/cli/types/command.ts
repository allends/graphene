import { Command } from "commander";

export interface CommandRegistration {
  register(program: Command): void;
}
