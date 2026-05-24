/**
 * Static map of Lucide icon-name → Svelte component for the 19 categories
 * declared in `src-tauri/data/categories.json`. Using a static map keeps the
 * bundler happy (no dynamic imports), keeps load instant (no async resolution
 * at render time), and makes the supported icon set explicit.
 *
 * If `tools/categorize/categorize.py` ever introduces a new category, the
 * Lucide icon for that slug must be added here too. The Discover grid falls
 * back to `HelpCircle` for any unknown name so a missing entry won't crash —
 * but it WILL look out of place, so add the mapping.
 */

import type { Component } from "svelte";

import Brain from "@lucide/svelte/icons/brain";
import Briefcase from "@lucide/svelte/icons/briefcase";
import Cloud from "@lucide/svelte/icons/cloud";
import Code from "@lucide/svelte/icons/code";
import Database from "@lucide/svelte/icons/database";
import FileCode from "@lucide/svelte/icons/file-code";
import FileText from "@lucide/svelte/icons/file-text";
import Gamepad2 from "@lucide/svelte/icons/gamepad-2";
import Globe from "@lucide/svelte/icons/globe";
import GraduationCap from "@lucide/svelte/icons/graduation-cap";
import HelpCircle from "@lucide/svelte/icons/help-circle";
import Lock from "@lucide/svelte/icons/lock";
import MessageSquare from "@lucide/svelte/icons/message-square";
import Music from "@lucide/svelte/icons/music";
import Palette from "@lucide/svelte/icons/palette";
import PenTool from "@lucide/svelte/icons/pen-tool";
import Settings from "@lucide/svelte/icons/settings";
import Terminal from "@lucide/svelte/icons/terminal";
import Video from "@lucide/svelte/icons/video";

const ICONS: Record<string, Component> = {
  Brain,
  Briefcase,
  Cloud,
  Code,
  Database,
  FileCode,
  FileText,
  Gamepad2,
  Globe,
  GraduationCap,
  HelpCircle,
  Lock,
  MessageSquare,
  Music,
  Palette,
  PenTool,
  Settings,
  Terminal,
  Video,
};

/**
 * Resolve a Lucide icon by PascalCase name. Falls back to `HelpCircle` for
 * any unknown name — see module docstring for why that fallback exists.
 */
export function resolveCategoryIcon(name: string): Component {
  return ICONS[name] ?? HelpCircle;
}
