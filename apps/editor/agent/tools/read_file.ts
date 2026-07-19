import { disableTool } from "eve/tools";

// Disabled: this framework built-in writes to the ephemeral sandbox FS, not the
// project storage, so its edits bypass review/revert. The authored write-file /
// read-file / list-files tools are the reviewable path. See default-harness docs.
export default disableTool();
