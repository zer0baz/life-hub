import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Auth } from '../../core/auth';

@Component({
  selector: 'app-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './auth-page.scss',
  templateUrl: './login.html',
})
export class Login {
  private readonly auth = inject(Auth);

  readonly busy = signal(false);
  readonly error = signal('');

  async google() {
    this.error.set('');
    this.busy.set(true);
    try {
      await this.auth.signInWithGoogle();
    } catch (e) {
      this.error.set('Connexion Google impossible : ' + (e as Error).message);
      this.busy.set(false);
    }
  }
}
