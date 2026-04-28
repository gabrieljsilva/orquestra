import { existsSync } from "node:fs";
import { join } from "node:path";
import type { DebugGenerator, GeneratedFile } from "./types";

/**
 * JetBrains keeps each Run/Debug configuration in its own XML file under
 * `.idea/runConfigurations/`. The file name is whatever — the configuration
 * `name` attribute is the displayed label. We pick stable underscore-cased
 * filenames so re-running the generator overwrites the same files instead
 * of stacking duplicates.
 *
 * Tested in WebStorm; same XML schema applies to IntelliJ IDEA Ultimate
 * and Rider for Node-based runs.
 */

function escapeXml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function buildConfigXml(name: string, parameters: string): string {
	const safeName = escapeXml(name);
	const safeParams = escapeXml(parameters);
	return `<component name="ProjectRunConfigurationManager">
  <configuration default="false" name="${safeName}" type="NodeJSConfigurationType"
                 path-to-js-file="$PROJECT_DIR$/node_modules/.bin/orquestra"
                 application-parameters="${safeParams}"
                 working-dir="$PROJECT_DIR$">
    <envs />
    <method v="2" />
  </configuration>
</component>
`;
}

export const webstormDebugGenerator: DebugGenerator = {
	id: "webstorm",
	displayName: "WebStorm / JetBrains",
	detect(cwd) {
		return existsSync(join(cwd, ".idea"));
	},
	files(_cwd): GeneratedFile[] {
		return [
			{
				relativePath: ".idea/runConfigurations/Orquestra__debug_all_features.xml",
				content: buildConfigXml("Orquestra: debug all features", "test --debug"),
			},
			{
				// `$FileNameWithoutExtension$` is the JetBrains macro for the
				// file open in the editor — equivalent to VS Code's
				// `${fileBasenameNoExtension}`.
				relativePath: ".idea/runConfigurations/Orquestra__debug_current_feature.xml",
				content: buildConfigXml(
					"Orquestra: debug current feature",
					"test --debug $FileNameWithoutExtension$",
				),
			},
		];
	},
	// No merge: each XML is a single configuration owned by us. The command
	// requires --force when these specific files already exist on disk.
};
