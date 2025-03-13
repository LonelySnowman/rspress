/// <reference types="@rspress-dev/plugin-preview" />

import fs from 'node:fs/promises';
import path from 'node:path';
import { SEARCH_INDEX_NAME, type SiteData } from '@rspress/shared';
import { groupBy } from 'lodash-es';
import { type FactoryContext, RuntimeModuleID } from '..';
import { TEMP_DIR, isProduction } from '../../constants';
import { createHash } from '../../utils';
import { extractPageData } from './extractPageData';
import { handleHighlightLanguages } from './highlightLanguages';
import { normalizeThemeConfig } from './normalizeThemeConfig';

// How can we let the client runtime access the `indexHash`?
// We can only do something after the Rspack build process because the index hash is generated within Rspack build process.There are two ways to do this:
// 1. insert window.__INDEX_HASH__ = 'foo' into the html template manually
// 2. replace the `__INDEX_HASH__` placeholder in the html template with the real index hash after Rspack build
export const indexHash = '';

function deletePrivateField<T>(obj: T): T {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }
  const newObj: T = { ...obj };
  for (const key in newObj) {
    if (key.startsWith('_')) {
      delete newObj[key];
    }
  }
  return newObj;
}

export async function siteDataVMPlugin(context: FactoryContext) {
  const { config, alias, userDocRoot, routeService, pluginDriver } = context;
  const userConfig = config;
  // prevent modify the origin config object
  const tempSearchObj = Object.assign({}, userConfig.search);

  // searchHooks is a absolute path which may leak information
  if (tempSearchObj) {
    tempSearchObj.searchHooks = undefined;
  }

  const highlightLanguages: Set<string> = new Set();
  const replaceRules = userConfig?.replaceRules || [];

  const searchConfig = userConfig?.search || {};

  // If the dev server restart when config file, we will reuse the siteData instead of extracting the siteData from source files again.
  const domain =
    searchConfig?.mode === 'remote' ? (searchConfig.domain ?? '') : '';

  const searchCodeBlocks =
    'codeBlocks' in searchConfig ? Boolean(searchConfig.codeBlocks) : true;

  const pages = await extractPageData(
    replaceRules,
    alias,
    domain,
    userDocRoot,
    routeService,
    highlightLanguages,
    searchCodeBlocks,
  );
  // modify page index by plugins
  await pluginDriver.modifySearchIndexData(pages);

  const versioned =
    userConfig.search &&
    userConfig.search.mode !== 'remote' &&
    userConfig.search.versioned;

  const groupedPages = groupBy(pages, page => {
    if (page.frontmatter?.pageType === 'home') {
      return 'noindex';
    }

    const version = versioned ? page.version : '';
    const lang = page.lang || '';

    return `${version}###${lang}`;
  });
  // remove the pages marked as noindex
  delete groupedPages.noindex;

  const indexHashByGroup = {} as Record<string, string>;

  // Generate search index by different versions & languages, file name is {SEARCH_INDEX_NAME}.{version}.{lang}.{hash}.json
  await Promise.all(
    Object.keys(groupedPages).map(async group => {
      // Avoid writing filepath in compile-time
      const stringifiedIndex = JSON.stringify(
        groupedPages[group].map(deletePrivateField),
      );
      const indexHash = createHash(stringifiedIndex);
      indexHashByGroup[group] = indexHash;

      const [version, lang] = group.split('###');
      const indexVersion = version ? `.${version.replace('.', '_')}` : '';
      const indexLang = lang ? `.${lang}` : '';

      await fs.mkdir(TEMP_DIR, { recursive: true });
      await fs.writeFile(
        path.join(
          TEMP_DIR,
          `${SEARCH_INDEX_NAME}${indexVersion}${indexLang}.${indexHash}.json`,
        ),
        stringifiedIndex,
      );
    }),
  );

  // Run extendPageData hook in plugins
  await Promise.all(
    pages.map(async pageData => pluginDriver.extendPageData(pageData)),
  );

  const siteData: Omit<SiteData, 'root'> = {
    title: userConfig?.title || '',
    description: userConfig?.description || '',
    icon: userConfig?.icon || '',
    route: userConfig?.route || {},
    themeConfig: normalizeThemeConfig(userConfig, pages),
    base: userConfig?.base || '/',
    lang: userConfig?.lang || '',
    locales: userConfig?.locales || userConfig.themeConfig?.locales || [],
    logo: userConfig?.logo || '',
    logoText: userConfig?.logoText || '',
    ssg: Boolean(userConfig?.ssg) ?? true,
    multiVersion: {
      default: userConfig?.multiVersion?.default || '',
      versions: userConfig?.multiVersion?.versions || [],
    },
    search: tempSearchObj ?? { mode: 'local' },
    pages: pages.map(page => {
      // omit some fields for runtime size
      const { content, id, domain, _filepath, _html, ...rest } = page;
      // In production, we cannot expose the complete filepath for security reasons
      return isProduction() ? rest : { ...rest, _filepath };
    }),
    markdown: {
      showLineNumbers: userConfig?.markdown?.showLineNumbers ?? false,
      defaultWrapCode: userConfig?.markdown?.defaultWrapCode ?? false,
      codeHighlighter: userConfig?.markdown?.codeHighlighter || 'prism',
    },
  };

  const { highlightLanguages: defaultLanguages = [] } = config.markdown || {};

  // this field is extended in "plugin-preview"
  if (Array.isArray(siteData.pages[0]?.extraHighlightLanguages)) {
    siteData.pages[0].extraHighlightLanguages.forEach(lang =>
      highlightLanguages.add(lang),
    );
  }

  const aliases = handleHighlightLanguages(
    highlightLanguages,
    defaultLanguages,
  );
  const sortedAliases = Object.fromEntries(Object.entries(aliases).sort());
  const sortedHighlightLanguages = Array.from(highlightLanguages).sort();

  return {
    [`${RuntimeModuleID.SiteData}.mjs`]: `export default ${JSON.stringify(
      siteData,
      null,
      2,
    )}`,
    [RuntimeModuleID.SearchIndexHash]: `export default ${JSON.stringify(
      indexHashByGroup,
      null,
      2,
    )}`,
    [RuntimeModuleID.PrismLanguages]: `export const aliases = ${JSON.stringify(
      sortedAliases,
      null,
      2,
    )};
    export const languages = {
      ${sortedHighlightLanguages.map(lang => {
        return `"${lang}": require(
          "react-syntax-highlighter/dist/cjs/languages/prism/${lang}"
        ).default`;
      })}
    }`,
  };
}
