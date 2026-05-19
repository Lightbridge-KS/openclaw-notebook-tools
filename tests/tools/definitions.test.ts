import { describe, expect, it } from "vitest";

import { notebookToolPluginDefinitions } from "../../src/tools/definitions.js";

describe("notebook tool plugin definitions", () => {
  it("exposes static metadata for all notebook tools", () => {
    expect(
      notebookToolPluginDefinitions.map((definition) => ({
        name: definition.tool.name,
        label: definition.tool.label,
        description: definition.tool.description,
        parameters: definition.tool.parameters,
        optional: definition.optional,
      })),
    ).toMatchObject([
      {
        name: "notebook_create",
        label: "Create Notebook",
        optional: false,
      },
      {
        name: "notebook_read",
        label: "Read Notebook",
        optional: false,
      },
      {
        name: "notebook_list_cells",
        label: "List Notebook Cells",
        optional: false,
      },
      {
        name: "notebook_search",
        label: "Search Notebook",
        optional: false,
      },
      {
        name: "notebook_edit_cell",
        label: "Edit Notebook Cell",
        optional: false,
      },
      {
        name: "notebook_insert_cell",
        label: "Insert Notebook Cell",
        optional: false,
      },
      {
        name: "notebook_delete_cell",
        label: "Delete Notebook Cell",
        optional: false,
      },
      {
        name: "notebook_clear_outputs",
        label: "Clear Notebook Outputs",
        optional: false,
      },
      {
        name: "notebook_validate",
        label: "Validate Notebook",
        optional: false,
      },
    ]);

    for (const definition of notebookToolPluginDefinitions) {
      expect(definition.tool.description.length).toBeGreaterThan(0);
      expect(definition.tool.parameters).toMatchObject({ type: "object" });
    }
  });
});
