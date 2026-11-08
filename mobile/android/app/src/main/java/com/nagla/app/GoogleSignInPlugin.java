package com.nagla.app;

import androidx.core.content.ContextCompat;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.GetCredentialException;
import androidx.credentials.exceptions.NoCredentialException;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;

/**
 * Native "Sign in with Google" (Android Credential Manager + Google Identity SDK).
 * JS: Capacitor.registerPlugin('NaglaGoogle').signIn({ serverClientId }) → { idToken, email, name }.
 * serverClientId is the Web OAuth client ID (the ID token's audience, checked by the API).
 * Google only accepts the request when an Android OAuth client exists for com.nagla.app + this APK's SHA-1.
 */
@CapacitorPlugin(name = "NaglaGoogle")
public class GoogleSignInPlugin extends Plugin {

    @PluginMethod
    public void signIn(PluginCall call) {
        String serverClientId = call.getString("serverClientId");
        if (serverClientId == null || serverClientId.isEmpty()) {
            call.reject("serverClientId is required", "config");
            return;
        }
        GetSignInWithGoogleOption option = new GetSignInWithGoogleOption.Builder(serverClientId).build();
        GetCredentialRequest request = new GetCredentialRequest.Builder().addCredentialOption(option).build();

        CredentialManager.create(getContext()).getCredentialAsync(
            getActivity(), request, null, ContextCompat.getMainExecutor(getContext()),
            new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                @Override
                public void onResult(GetCredentialResponse response) {
                    Credential credential = response.getCredential();
                    if (credential instanceof CustomCredential
                        && GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(credential.getType())) {
                        GoogleIdTokenCredential google = GoogleIdTokenCredential.createFrom(((CustomCredential) credential).getData());
                        JSObject ret = new JSObject();
                        ret.put("idToken", google.getIdToken());
                        ret.put("email", google.getId());
                        ret.put("name", google.getDisplayName());
                        call.resolve(ret);
                    } else {
                        call.reject("Unexpected credential type", "unexpected");
                    }
                }

                @Override
                public void onError(GetCredentialException e) {
                    String code = e instanceof GetCredentialCancellationException ? "canceled"
                        : e instanceof NoCredentialException ? "no_account" : "failed";
                    call.reject(e.getMessage() != null ? e.getMessage() : e.getType(), code, e);
                }
            });
    }
}
