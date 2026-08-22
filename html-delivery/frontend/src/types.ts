export type ContentType = 'game' | 'webpage';
export type SortMode = 'latest' | 'likes';

export interface Cohort {
  cohortId: string;
  name: string;
  dateLabel: string | null;
  submissionMode: 'individual' | 'team';
  status: 'active' | 'archived';
  contentCount: number;
  gameCount: number;
  webpageCount: number;
}

export interface Content {
  contentId: string;
  title: string;
  contentType: ContentType;
  owner: { kind: 'individual' | 'team'; name: string };
  cohort: Pick<Cohort, 'cohortId' | 'name' | 'dateLabel'> | null;
  latestVersion: number;
  likes: number;
  updatedAt: string;
  viewerUrl: string;
}

export interface ContentPage {
  contents: Content[];
  total: number;
  nextCursor: string | null;
}
