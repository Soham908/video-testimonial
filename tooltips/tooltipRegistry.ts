export interface TooltipDef { id: string; titleKey: string; bodyKey: string; }
const tip = (id: string, key: string): TooltipDef => ({ id, titleKey: `tooltips.${key}.title`, bodyKey: `tooltips.${key}.body` });

export const TOOLTIP_REGISTRY: TooltipDef[] = [
  tip('home.overview', 'homeOverview'),
  tip('home.profileAvatar', 'homeProfileAvatar'),
  tip('bottomTabBar.myVideosTab', 'bottomTabBarMyVideos'),
  tip('home.nextAction', 'homeNextAction'),
  tip('question.text', 'questionText'),
  tip('question.audio', 'questionAudio'),
  tip('question.points', 'questionPoints'),
  tip('question.actions', 'questionActions'),
];

// Versioned, device-local completion flags; the old two standalone tips
// do not count as having seen the new guided tour.
export const HOME_TOUR = 'guided-tour.home.v2';
export const QUESTION_TOUR = 'guided-tour.question.v1';
export const HOME_TOOLTIP_IDS = ['home.overview', 'home.profileAvatar', 'bottomTabBar.myVideosTab', 'home.nextAction'];
export const QUESTION_TOOLTIP_IDS = ['question.text', 'question.audio', 'question.points', 'question.actions'];
