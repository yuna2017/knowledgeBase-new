export interface AuthorProfile {
  displayName: string
  github: string
}

export const defaultAuthorId = 'yuna2017'

export const authorProfiles: Record<string, AuthorProfile> = {
  yuna2017: {
    displayName: '燕山大学大学生网络信息协会',
    github: 'yuna2017'
  },
  HaoxiangXia: {
    displayName: 'Marth7th',
    github: 'HaoxiangXia'
  },
  kindness314: {
    displayName: 'kindness314',
    github: 'kindness314'
  },
  liugu2023: {
    displayName: 'liugu2023',
    github: 'liugu2023'
  }
}
