import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Auth } from '../../core/auth';

type Mode = 'signin' | 'signup' | 'reset';

const ERRORS: Record<string, string> = {
  invalid_credentials: 'E-mail ou mot de passe incorrect.',
  email_not_confirmed: 'Confirme d’abord ton adresse via le lien reçu par e-mail.',
  user_already_exists: 'Un compte existe déjà avec cette adresse.',
  weak_password: 'Mot de passe trop faible (6 caractères minimum).',
  over_email_send_rate_limit: 'Trop d’e-mails envoyés. Réessaie dans quelques minutes.',
};

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './auth-page.scss',
  templateUrl: './login.html',
})
export class Login {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);

  readonly mode = signal<Mode>('signin');
  readonly busy = signal(false);
  readonly error = signal('');
  readonly info = signal('');

  email = '';
  password = '';
  displayName = '';

  setMode(mode: Mode) {
    this.mode.set(mode);
    this.error.set('');
    this.info.set('');
  }

  async submit() {
    this.error.set('');
    this.info.set('');
    this.busy.set(true);
    try {
      const mode = this.mode();
      if (mode === 'signin') {
        await this.auth.signIn(this.email.trim(), this.password);
        await this.router.navigateByUrl('/');
      } else if (mode === 'signup') {
        const { signedIn } = await this.auth.signUp(this.email.trim(), this.password, this.displayName.trim());
        if (signedIn) await this.router.navigateByUrl('/');
        else this.info.set('Compte créé. Clique sur le lien reçu par e-mail pour l’activer, puis connecte-toi.');
      } else {
        await this.auth.sendPasswordReset(this.email.trim());
        this.info.set('Si un compte existe pour cette adresse, un lien de réinitialisation vient d’être envoyé.');
      }
    } catch (e) {
      const err = e as { code?: string; message: string };
      this.error.set((err.code && ERRORS[err.code]) || err.message);
    } finally {
      this.busy.set(false);
    }
  }
}
