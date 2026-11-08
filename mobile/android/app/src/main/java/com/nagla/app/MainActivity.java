package com.nagla.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(GoogleSignInPlugin.class); // native Google sign-in (second option)
        super.onCreate(savedInstanceState);
    }
}
