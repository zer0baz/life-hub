import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth-guards';

export const routes: Routes = [
  { path: 'connexion', canActivate: [guestGuard], title: 'Connexion · Ma vie', loadComponent: () => import('./features/auth/login').then((m) => m.Login) },
  {
    path: 'nouveau-mot-de-passe',
    canActivate: [authGuard],
    title: 'Nouveau mot de passe · Ma vie',
    loadComponent: () => import('./features/auth/new-password').then((m) => m.NewPassword),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell').then((m) => m.Shell),
    children: [
      { path: '', title: 'Tableau de bord · Ma vie', loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard) },
      {
        path: 'depenses',
        loadComponent: () => import('./features/expenses/expenses-layout').then((m) => m.ExpensesLayout),
        children: [
          { path: '', title: 'Dépenses · Ma vie', loadComponent: () => import('./features/expenses/overview/overview').then((m) => m.Overview) },
          { path: 'operations', title: 'Opérations · Ma vie', loadComponent: () => import('./features/expenses/operations/operations').then((m) => m.Operations) },
          { path: 'operations/:id', title: 'Modifier · Ma vie', loadComponent: () => import('./features/expenses/operation-form/operation-form').then((m) => m.OperationForm) },
          { path: 'ajouter', title: 'Nouvelle opération · Ma vie', loadComponent: () => import('./features/expenses/operation-form/operation-form').then((m) => m.OperationForm) },
          { path: 'recurrent', title: 'Récurrent · Ma vie', loadComponent: () => import('./features/expenses/recurring/recurring').then((m) => m.Recurring) },
          { path: 'statistiques', title: 'Statistiques · Ma vie', loadComponent: () => import('./features/expenses/stats/stats').then((m) => m.Stats) },
        ],
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
