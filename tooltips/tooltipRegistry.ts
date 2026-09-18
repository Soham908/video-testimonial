// Single place listing every anchored tooltip in the app. Add, remove, or
// reword one here (plus its matching i18n keys under "tooltips.<key>" in
// all three language files) rather than hunting through screen components -
// the screens themselves only ever reference an id from this list via
// <TooltipTarget id="...">, they don't own any tooltip copy directly.
export interface TooltipDef {
  id: string;
  titleKey: string;
  bodyKey: string;
}

export const TOOLTIP_REGISTRY: TooltipDef[] = [
  {
    id: 'home.profileAvatar',
    titleKey: 'tooltips.homeProfileAvatar.title',
    bodyKey: 'tooltips.homeProfileAvatar.body',
  },
  {
    id: 'bottomTabBar.myVideosTab',
    titleKey: 'tooltips.bottomTabBarMyVideos.title',
    bodyKey: 'tooltips.bottomTabBarMyVideos.body',
  },
];

// Grouped ids for HelpButton instances - a screen's "?" button replays
// whichever of these ids apply to it, in this order, regardless of
// whether they were already dismissed.
export const HOME_TOOLTIP_IDS = ['home.profileAvatar', 'bottomTabBar.myVideosTab'];
