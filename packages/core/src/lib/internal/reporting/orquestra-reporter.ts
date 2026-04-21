import type { FeatureMeta } from "../../types/reporting";
import type { StepEvent } from "../../types/shard-manager/shard-manager.types";

export abstract class OrquestraReporter {
	abstract run(events: StepEvent[], meta: FeatureMeta[]): Promise<void> | void;
}
