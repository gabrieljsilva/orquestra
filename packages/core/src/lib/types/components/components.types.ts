import { OrquestraContainer } from "../../internal/orquestra-container";
import { OrquestraService } from "../../internal/orquestra-service";
import { ClassConstructor, Provider } from "../ioc";

export type ServiceProvider = ClassConstructor<OrquestraService> | Provider<OrquestraService>;

export interface ContainerWithDependencies {
	container: ClassConstructor<OrquestraContainer<any>> | Provider<OrquestraContainer<any>>;
	dependsOn?: Array<ContainerProvider>;
}

export type ContainerProvider =
	| ClassConstructor<OrquestraContainer<any>>
	| Provider<OrquestraContainer<any>>
	| ContainerWithDependencies;
