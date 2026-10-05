/**
 * GENERATED CODE - DO NOT MODIFY
 */
import {
  type Auth,
  type Options as XrpcOptions,
  Server as XrpcServer,
  type StreamConfigOrHandler,
  type MethodConfigOrHandler,
  createServer as createXrpcServer,
} from "@atproto/xrpc-server";
import { schemas } from "./lexicons.js";

export function createServer(options?: XrpcOptions): Server {
  return new Server(options);
}

export class Server {
  xrpc: XrpcServer;
  app: AppNS;
  com: ComNS;

  constructor(options?: XrpcOptions) {
    this.xrpc = createXrpcServer(schemas, options);
    this.app = new AppNS(this);
    this.com = new ComNS(this);
  }
}

export class AppNS {
  _server: Server;
  kodamachi: AppKodamachiNS;
  navyfragen: AppNavyfragenNS;
  bsky: AppBskyNS;

  constructor(server: Server) {
    this._server = server;
    this.kodamachi = new AppKodamachiNS(server);
    this.navyfragen = new AppNavyfragenNS(server);
    this.bsky = new AppBskyNS(server);
  }
}

export class AppKodamachiNS {
  _server: Server;
  inbox: AppKodamachiInboxNS;

  constructor(server: Server) {
    this._server = server;
    this.inbox = new AppKodamachiInboxNS(server);
  }
}

export class AppKodamachiInboxNS {
  _server: Server;

  constructor(server: Server) {
    this._server = server;
  }
}

export class AppNavyfragenNS {
  _server: Server;

  constructor(server: Server) {
    this._server = server;
  }
}

export class AppBskyNS {
  _server: Server;
  actor: AppBskyActorNS;

  constructor(server: Server) {
    this._server = server;
    this.actor = new AppBskyActorNS(server);
  }
}

export class AppBskyActorNS {
  _server: Server;

  constructor(server: Server) {
    this._server = server;
  }
}

export class ComNS {
  _server: Server;
  atproto: ComAtprotoNS;

  constructor(server: Server) {
    this._server = server;
    this.atproto = new ComAtprotoNS(server);
  }
}

export class ComAtprotoNS {
  _server: Server;
  repo: ComAtprotoRepoNS;

  constructor(server: Server) {
    this._server = server;
    this.repo = new ComAtprotoRepoNS(server);
  }
}

export class ComAtprotoRepoNS {
  _server: Server;

  constructor(server: Server) {
    this._server = server;
  }
}
