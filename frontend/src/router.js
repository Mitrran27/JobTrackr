import { createRouter, createWebHistory } from 'vue-router';
import { auth } from './auth';

const routes = [
  { path: '/login', component: () => import('./views/Login.vue'), meta: { public: true } },
  { path: '/reset', component: () => import('./views/Reset.vue'), meta: { public: true } },
  { path: '/', component: () => import('./views/Dashboard.vue'), meta: { title: 'Dashboard' } },
  { path: '/board', component: () => import('./views/Board.vue'), meta: { title: 'Applications' } },
  { path: '/jobs/new', component: () => import('./views/AddJob.vue'), meta: { title: 'Add a job' } },
  { path: '/jobs/:id', component: () => import('./views/JobDetail.vue'), meta: { title: 'Job' } },
  { path: '/profile', component: () => import('./views/Profile.vue'), meta: { title: 'Profile' } },
  { path: '/career', component: () => import('./views/Career.vue'), meta: { title: 'Career & income' } },
  { path: '/cv', component: () => import('./views/CV.vue'), meta: { title: 'CV' } },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

const router = createRouter({ history: createWebHistory(), routes });

router.beforeEach(async (to) => {
  if (to.meta.public) return auth.token && to.path === '/login' ? '/' : true;
  if (!auth.token) return '/login';
  await auth.load();
  return auth.token ? true : '/login';
});

export default router;
