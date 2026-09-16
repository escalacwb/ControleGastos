import React, { useEffect, useState } from "react";
import { View, ActivityIndicator, Text } from "react-native";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { supabase } from "../lib/supabase";
import { colors } from "../lib/theme";
import LoginScreen from "../screens/LoginScreen";
import { DataProvider } from "./context";
import { FormModal } from "./ui";
import { Overview, Transactions, Cards, Reports, More } from "./screens";
const Tab = createBottomTabNavigator();
const icons = {
  Início: "M3 10l9-7 9 7v11h-6v-7H9v7H3z",
  Lançamentos: "M5 5h14M5 12h14M5 19h14",
  Cartões: "M3 5h18v14H3zM3 9h18M6 15h4",
  Relatórios: "M4 20V12M12 20V4M20 20V8",
  Mais: "M4 6h16M4 12h16M4 18h16",
};
export default function EvolutionApp() {
  const [session, setSession] = useState(null),
    [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (alive) {
          setSession(data.session);
          setReady(true);
        }
      })
      .catch(() => {
        if (alive) setReady(true);
      });
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, next) => {
        if (alive) {
          setSession(next);
          setReady(true);
        }
      },
    );
    return () => {
      alive = false;
      listener.subscription.unsubscribe();
    };
  }, []);
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {!ready ? (
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: colors.background,
          }}
        >
          <ActivityIndicator color={colors.primary} />
          <Text style={{ color: colors.muted, marginTop: 12 }}>
            Abrindo sua conta…
          </Text>
        </View>
      ) : session ? (
        <DataProvider key={session.user.id} user={session.user}>
          <SafeAreaView
            edges={["top", "left", "right"]}
            style={{ flex: 1, backgroundColor: colors.background }}
          >
            <NavigationContainer>
              <Tab.Navigator
                screenOptions={({ route }) => ({
                  headerShown: false,
                  tabBarActiveTintColor: colors.primary,
                  tabBarInactiveTintColor: colors.muted,
                  tabBarStyle: {
                    backgroundColor: "white",
                    borderTopColor: colors.border,
                  },
                  tabBarLabelStyle: { fontSize: 10, fontWeight: "600" },
                  tabBarIcon: ({ color, size }) => (
                    <Svg width={size} height={size} viewBox="0 0 24 24">
                      <Path
                        d={icons[route.name]}
                        fill="none"
                        stroke={color}
                        strokeWidth={1.7}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </Svg>
                  ),
                })}
              >
                <Tab.Screen name="Início" component={Overview} />
                <Tab.Screen name="Lançamentos" component={Transactions} />
                <Tab.Screen name="Cartões" component={Cards} />
                <Tab.Screen name="Relatórios" component={Reports} />
                <Tab.Screen name="Mais" component={More} />
              </Tab.Navigator>
            </NavigationContainer>
            <FormModal />
          </SafeAreaView>
        </DataProvider>
      ) : (
        <LoginScreen />
      )}
    </SafeAreaProvider>
  );
}
