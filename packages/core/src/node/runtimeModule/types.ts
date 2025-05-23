import type { TransformHandler } from '@rsbuild/core';
import type { UserConfig } from '@rspress/shared';
import type { PluginDriver } from '../PluginDriver';
import type { RouteService } from '../route/RouteService';

export interface FactoryContext {
  userDocRoot: string;
  config: UserConfig;
  isSSR: boolean;
  runtimeTempDir: string;
  alias: Record<string, string | string[]>;
  routeService: RouteService;
  pluginDriver: PluginDriver;
}

export type VirtualModulePlugin = (
  context: Omit<FactoryContext, 'isSSR' | 'alias'>,
) => Record<string, TransformHandler>;

export enum RuntimeModuleID {
  GlobalStyles = 'virtual-global-styles',
  GlobalComponents = 'virtual-global-components',
  RouteForClient = 'virtual-routes',
  RouteForSSR = 'virtual-routes-ssr',
  SiteData = 'virtual-site-data',
  SearchIndexHash = 'virtual-search-index-hash',
  I18nText = 'virtual-i18n-text',
  SearchHooks = 'virtual-search-hooks',
  PrismLanguages = 'virtual-prism-languages',
}
