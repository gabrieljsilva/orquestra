import { Injectable } from "../ioc-container";

export abstract class OrquestraMacro extends Injectable {
  abstract title: string;
  abstract execute(ctx?: Readonly<any>): Promise<any> | any;
}


