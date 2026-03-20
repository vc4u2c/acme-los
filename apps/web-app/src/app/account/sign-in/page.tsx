import { CustomerAuthLaunchPage } from '../../../components/web/customer-auth-launch-page';

export default function SignInPage() {
  return (
    <CustomerAuthLaunchPage
      returnTo="/account/profile"
      eyebrow="Customer portal"
      title="Opening secure sign in"
      description="Use the hosted Okta customer portal to resume the application, review disclosures, and check funding updates in one secure place."
      actionLabel="Continue to secure sign in"
      launchingLabel="Redirecting to secure sign in..."
    />
  );
}
