import StarterKit from "@tiptap/starter-kit";

/**
 * The editor schema, shared by the browser editor and server-side file import,
 * so imported documents contain exactly the nodes/marks the editor supports.
 */
export const editorExtensions = [StarterKit.configure({ heading: { levels: [1, 2, 3] } })];
