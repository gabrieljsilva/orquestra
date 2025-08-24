import { OrquestraContainer } from "../../internal/orquestra-container";
import { OrquestraHelper } from "../../internal/orquestra-helper";
import { OrquestraPlugin } from "../../internal/orquestra-plugin";
import { OrquestraMacro } from "../../internal/orquestra-macro";
import { OrquestraService } from "../../internal/orquestra-service";
import { ClassConstructor, Provider } from "../ioc";

export type PluginProvider = ClassConstructor<OrquestraPlugin> | Provider<OrquestraPlugin>;
export type HelperProvider = ClassConstructor<OrquestraHelper> | Provider<OrquestraHelper>;
export type ServiceProvider = ClassConstructor<OrquestraService> | Provider<OrquestraService>;
export type MacroProvider = ClassConstructor<OrquestraMacro> | Provider<OrquestraMacro>;

export interface ContainerWithDependencies {
	container: ClassConstructor<OrquestraContainer<any>> | Provider<OrquestraContainer<any>>;
	dependsOn?: Array<ContainerProvider>;
}

export type ContainerProvider =
	| ClassConstructor<OrquestraContainer<any>>
	| Provider<OrquestraContainer<any>>
	| ContainerWithDependencies;

export type IOrquestraHelper = {};
